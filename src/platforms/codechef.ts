import axios from 'axios';
import { cachedFetch } from '../cache';
import { getConfig } from '../config';
import { UnifiedContest } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CC_CONTESTS_URL = 'https://www.codechef.com/api/list/contests/all';

const CC_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  Accept: 'application/json',
};

/** Cache key for the full CodeChef contests response. */
const CACHE_KEY = 'cc:contests:all';

/** Cache TTL: 5 minutes (ms) */
const TTL_5_MIN = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Raw contest shape returned by the CodeChef contests API. */
interface CCRawContest {
  contest_code: string;
  contest_name: string;
  contest_start_date_iso: string;
  contest_end_date_iso: string;
  distinct_users: number;
  [key: string]: unknown;
}

/** The raw API response envelope. */
interface CCApiResponse {
  future_contests: CCRawContest[];
  present_contests: CCRawContest[];
  past_contests: CCRawContest[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Map a raw CodeChef contest object to a {@link UnifiedContest}.
 * @param c Raw contest from the CodeChef API.
 */
function mapContest(c: CCRawContest): UnifiedContest {
  const startTime = new Date(c.contest_start_date_iso);
  const endTime = new Date(c.contest_end_date_iso);
  const durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

  return {
    platform: 'CODECHEF',
    id: c.contest_code,
    name: c.contest_name,
    startTime,
    endTime,
    durationSeconds,
    url: `https://www.codechef.com/${c.contest_code}`,
  };
}

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class CodeChef {
  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Fetch and cache the full CodeChef contests API response.
   *
   * A single network call returns upcoming, ongoing, and past contests
   * simultaneously. The result is cached for **5 minutes** so that all
   * derived methods benefit from the same cached payload.
   *
   * @returns The raw API response envelope.
   */
  private async fetchAllRaw(): Promise<CCApiResponse> {
    const { http } = getConfig();

    return cachedFetch(
      CACHE_KEY,
      async () => {
        const response = await axios.get<CCApiResponse>(CC_CONTESTS_URL, {
          timeout: http.timeout,
          headers: CC_HEADERS,
        });
        return response.data;
      },
      TTL_5_MIN,
    );
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Fetch upcoming CodeChef contests (contests that have not yet started).
   *
   * Data is derived from `future_contests` in the API response and is
   * cached for **5 minutes**.
   *
   * @returns A promise that resolves to an array of upcoming contests.
   */
  async getUpcomingContests(): Promise<UnifiedContest[]> {
    const data = await this.fetchAllRaw();
    return (data.future_contests ?? []).map(mapContest);
  }

  /**
   * Fetch currently ongoing CodeChef contests (contests in progress).
   *
   * Data is derived from `present_contests` in the API response and is
   * cached for **5 minutes**.
   *
   * @returns A promise that resolves to an array of ongoing contests.
   */
  async getOngoingContests(): Promise<UnifiedContest[]> {
    const data = await this.fetchAllRaw();
    return (data.present_contests ?? []).map(mapContest);
  }

  /**
   * Fetch past CodeChef contests (contests that have already ended).
   *
   * Data is derived from `past_contests` in the API response and is
   * cached for **5 minutes**.
   *
   * @param limit Optional maximum number of past contests to return.
   *              When omitted, all available past contests are returned.
   * @returns A promise that resolves to an array of past contests,
   *          ordered most-recent first as provided by the API.
   */
  async getPastContests(limit?: number): Promise<UnifiedContest[]> {
    const data = await this.fetchAllRaw();
    const past: CCRawContest[] = data.past_contests ?? [];
    const sliced = limit !== undefined ? past.slice(0, limit) : past;
    return sliced.map(mapContest);
  }

  /**
   * Fetch all CodeChef contests in a single API call.
   *
   * Returns upcoming, ongoing, and past contests together, derived from
   * the cached API response. This is the most efficient method when you
   * need more than one category at a time.
   *
   * @returns An object with three arrays: `upcoming`, `ongoing`, and `past`.
   *
   * @example
   * ```ts
   * const { upcoming, ongoing, past } = await codechef.getAllContests();
   * ```
   */
  async getAllContests(): Promise<{
    upcoming: UnifiedContest[];
    ongoing: UnifiedContest[];
    past: UnifiedContest[];
  }> {
    const data = await this.fetchAllRaw();

    return {
      upcoming: (data.future_contests ?? []).map(mapContest),
      ongoing: (data.present_contests ?? []).map(mapContest),
      past: (data.past_contests ?? []).map(mapContest),
    };
  }

  /**
   * Fetch a single CodeChef contest by its contest code.
   *
   * Searches across upcoming, ongoing, and past contests from the cached
   * API response. Returns `null` if no matching contest is found.
   *
   * @param contestCode The unique contest code (e.g. `'START100'`).
   * @returns The matching {@link UnifiedContest}, or `null` if not found.
   *
   * @example
   * ```ts
   * const contest = await codechef.getContest('START100');
   * if (contest) {
   *   console.log(contest.name, contest.startTime);
   * }
   * ```
   */
  async getContest(contestCode: string): Promise<UnifiedContest | null> {
    const data = await this.fetchAllRaw();

    const allRaw: CCRawContest[] = [
      ...(data.future_contests ?? []),
      ...(data.present_contests ?? []),
      ...(data.past_contests ?? []),
    ];

    const found = allRaw.find(
      (c) => c.contest_code.toLowerCase() === contestCode.toLowerCase(),
    );

    return found ? mapContest(found) : null;
  }
}
