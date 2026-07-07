/**
 * Unified Contests API
 * Aggregates contests from all platforms into a single normalized stream.
 */
import { Codeforces } from '../platforms/codeforces';
import { AtCoder } from '../platforms/atcoder';
import { CodeChef } from '../platforms/codechef';
import { LeetCode } from '../platforms/leetcode';
import { UnifiedContest, FetchOptions, Platform } from '../types';

export class Contests {
  private cf = new Codeforces();
  private ac = new AtCoder();
  private cc = new CodeChef();
  private lc = new LeetCode();

  /**
   * Fetch upcoming contests from all platforms, sorted by start time.
   *
   * @example
   * // Get all upcoming contests
   * const all = await cp.contests.getUpcoming();
   *
   * // Get only CF + AtCoder, filtered by keyword, limited to 5
   * const cfac = await cp.contests.getUpcoming({
   *   platforms: ['CODEFORCES', 'ATCODER'],
   *   keywords: ['div.2', 'beginner'],
   *   limit: 5,
   * });
   */
  async getUpcoming(options?: FetchOptions): Promise<UnifiedContest[]> {
    return this._fetch({ ...options, includeOngoing: false, includePast: false });
  }

  /**
   * Fetch contests from all platforms, with flags for including ongoing and past.
   */
  async getAll(options?: FetchOptions): Promise<UnifiedContest[]> {
    return this._fetch({ includeOngoing: true, ...options });
  }

  /**
   * Fetch contests from a single platform.
   */
  async getByPlatform(platform: Platform, options?: Omit<FetchOptions, 'platforms'>): Promise<UnifiedContest[]> {
    return this._fetch({ ...options, platforms: [platform] });
  }

  /**
   * Search contests by name across all platforms.
   * @param query  Case-insensitive substring match on contest name
   */
  async search(query: string, options?: Omit<FetchOptions, 'keywords'>): Promise<UnifiedContest[]> {
    return this._fetch({ ...options, keywords: [query] });
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async _fetch(options: FetchOptions = {}): Promise<UnifiedContest[]> {
    const platforms = options.platforms ?? ['CODEFORCES', 'ATCODER', 'CODECHEF', 'LEETCODE'];

    const fetchers: Promise<UnifiedContest[]>[] = [];

    if (platforms.includes('CODEFORCES')) fetchers.push(this.cf.getUpcomingContests().catch(() => []));
    if (platforms.includes('ATCODER'))    fetchers.push(this.ac.getUpcomingContests().catch(() => []));
    if (platforms.includes('CODECHEF')) {
      const ccFetch = options.includeOngoing
        ? this.cc.getAllContests().then(r => [...r.upcoming, ...r.ongoing]).catch(() => [])
        : this.cc.getUpcomingContests().catch(() => []);
      fetchers.push(ccFetch);
    }
    if (platforms.includes('LEETCODE')) fetchers.push(this.lc.getUpcomingContests().catch(() => []));

    const results = await Promise.all(fetchers);
    let contests: UnifiedContest[] = results.flat();

    // Keyword filter
    if (options.keywords?.length) {
      const kws = options.keywords.map(k => k.toLowerCase());
      contests = contests.filter(c => kws.some(kw => c.name.toLowerCase().includes(kw)));
    }

    // Sort by start time ascending
    contests.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // Limit
    if (options.limit) contests = contests.slice(0, options.limit);

    return contests;
  }
}
