import { Codeforces, CFUserInfo, CFSubmission, CFProblem } from '../platforms/codeforces';
import { AtCoder, ACUserInfo } from '../platforms/atcoder';

// ---------------------------------------------------------------------------
// Shared return types
// ---------------------------------------------------------------------------

/** A CF user profile enriched with a sorted rank position. */
export type RankedCFUser = CFUserInfo & { rank: number };

/** An AC user profile enriched with a sorted rank position. */
export type RankedACUser = ACUserInfo & { rank: number };

/** A lightweight descriptor for a Codeforces problem. */
export type CFProblemRef = {
  /** Unique key — "{contestId}{index}", e.g. "1900A". */
  id: string;
  name: string;
  contestId?: number;
  index: string;
  rating?: number;
  tags?: string[];
};

/** Rating progress summary for a single user over an optional date window. */
export type RatingProgress = {
  startRating: number;
  endRating: number;
  /** Signed delta: endRating − startRating. */
  delta: number;
  history: Array<{
    date: Date;
    rating: number;
    contestName: string;
  }>;
};

/** Difficulty buckets for a user's solved problems on Codeforces. */
export type DifficultyDistribution = {
  '<800': number;
  '800-1199': number;
  '1200-1599': number;
  '1600-1999': number;
  '2000-2399': number;
  '2400+': number;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a unique problem key from a CF submission's problem descriptor.
 * Uses "{contestId}{index}" when contestId is present, otherwise just the
 * problem name (fallback for gym / mashup problems).
 */
function cfProblemKey(problem: CFSubmission['problem']): string {
  if (problem.contestId !== undefined) {
    return `${problem.contestId}${problem.index}`;
  }
  return problem.name;
}

/**
 * Return only the "OK" (accepted) submissions from a list, de-duplicated by
 * problem key so every problem appears at most once.
 */
function extractSolvedKeys(submissions: CFSubmission[]): Set<string> {
  const solved = new Set<string>();
  for (const s of submissions) {
    if (s.verdict === 'OK') {
      solved.add(cfProblemKey(s.problem));
    }
  }
  return solved;
}

/**
 * Convert a raw CF problem into a {@link CFProblemRef}.
 */
function toCFProblemRef(p: CFProblem): CFProblemRef {
  return {
    id: `${p.contestId}${p.index}`,
    name: p.name,
    contestId: p.contestId,
    index: p.index,
    rating: p.rating,
    tags: p.tags,
  };
}

// ---------------------------------------------------------------------------
// Analytics class
// ---------------------------------------------------------------------------

/**
 * **Analytics** — cross-platform competitive programming insights.
 *
 * Instantiates its own lightweight Codeforces and AtCoder clients so it can
 * be used standalone or alongside the top-level `cp` singleton.
 *
 * @example
 * ```ts
 * import { Analytics } from '@ronit/cp-api/unified/analytics';
 *
 * const analytics = new Analytics();
 *
 * const ranked = await analytics.compareUsers(['tourist', 'Um_nik'], 'CODEFORCES');
 * console.log(ranked); // [ { handle: 'tourist', rating: 3979, rank: 1 }, … ]
 * ```
 */
export class Analytics {
  private cf = new Codeforces();
  private ac = new AtCoder();

  // -------------------------------------------------------------------------
  // 1. compareUsers
  // -------------------------------------------------------------------------

  /**
   * Fetch profiles for multiple handles on the given platform, sort them by
   * **current rating** (descending) and annotate each with a 1-based `rank`.
   *
   * Users whose rating is `undefined` are placed at the bottom, ordered by
   * their original position in the input array.
   *
   * @param handles  Array of user handles to compare.
   * @param platform Target platform (`'CODEFORCES'` or `'ATCODER'`).
   * @returns        Sorted, ranked array of user profile objects.
   *
   * @example
   * ```ts
   * const top = await analytics.compareUsers(['tourist', 'Petr', 'ecnerwala'], 'CODEFORCES');
   * // top[0].rank === 1, top[0].handle === 'tourist'
   * ```
   */
  async compareUsers(
    handles: string[],
    platform: 'CODEFORCES' | 'ATCODER',
  ): Promise<RankedCFUser[] | RankedACUser[]> {
    if (platform === 'CODEFORCES') {
      // CF supports bulk handle lookup in a single request.
      const users = await this.cf.getUser(handles);

      const sorted = [...users].sort(
        (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
      );

      return sorted.map((u, i) => ({ ...u, rank: i + 1 })) as RankedCFUser[];
    }

    // AtCoder: one request per user (Kenkoooo doesn't support bulk lookup).
    const results = await Promise.all(
      handles.map(async (handle) => {
        const u = await this.ac.getUser(handle);
        return u ?? ({
          user_id: handle,
          rating: 0,
          highest_rating: 0,
          affiliation: '',
          rank: 0,
        } as ACUserInfo);
      }),
    );

    const sorted = [...results].sort(
      (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
    );

    return sorted.map((u, i) => ({ ...u, rank: i + 1 })) as RankedACUser[];
  }

  // -------------------------------------------------------------------------
  // 2. getCommonSolvedProblems
  // -------------------------------------------------------------------------

  /**
   * Find problems solved by **every** user in the provided list (set
   * intersection). Currently supports Codeforces only.
   *
   * Each user's recent 10,000 submissions are fetched concurrently. Only
   * submissions with `verdict === "OK"` are considered.
   *
   * @param handles  Two or more CF handles.
   * @param platform Must be `'CODEFORCES'`.
   * @returns        Array of {@link CFProblemRef} objects solved by all users.
   *
   * @example
   * ```ts
   * const common = await analytics.getCommonSolvedProblems(
   *   ['tourist', 'Petr'],
   *   'CODEFORCES',
   * );
   * ```
   */
  async getCommonSolvedProblems(
    handles: string[],
    platform: 'CODEFORCES',
  ): Promise<CFProblemRef[]> {
    if (handles.length === 0) return [];

    // Fetch all submissions concurrently (10 000 per user, same as isProblemSolved).
    const allSubmissions = await Promise.all(
      handles.map((h) => this.cf.getSubmissions(h, { count: 10000 })),
    );

    // Build a solved-key set for each user.
    const solvedSets = allSubmissions.map(extractSolvedKeys);

    // Intersect: start with the first user's set and narrow down.
    const [first, ...rest] = solvedSets;
    const intersection = new Set<string>(
      [...first].filter((key) => rest.every((s) => s.has(key))),
    );

    if (intersection.size === 0) return [];

    // Hydrate with full problem metadata from the problemset cache.
    const allProblems = await this.cf.getProblems();
    const problemMap = new Map<string, CFProblem>();
    for (const p of allProblems) {
      problemMap.set(`${p.contestId}${p.index}`, p);
    }

    const refs: CFProblemRef[] = [];
    for (const key of intersection) {
      const meta = problemMap.get(key);
      if (meta) {
        refs.push(toCFProblemRef(meta));
      } else {
        // Gym / mashup problem not in the public problemset — include minimal info.
        refs.push({ id: key, name: key, index: '', rating: undefined, tags: [] });
      }
    }

    // Return sorted by rating ascending, then by id for determinism.
    refs.sort((a, b) => {
      const ra = a.rating ?? 0;
      const rb = b.rating ?? 0;
      return ra !== rb ? ra - rb : a.id.localeCompare(b.id);
    });

    return refs;
  }

  // -------------------------------------------------------------------------
  // 3. getUniqueUnsolvedProblems
  // -------------------------------------------------------------------------

  /**
   * Return Codeforces problems that a user has **not** solved, optionally
   * filtered by rating range and tags.
   *
   * The full problemset is fetched (cached for 1 h) and the user's 10,000
   * most-recent submissions are used to build the solved set.
   *
   * @param handle   CF handle.
   * @param options  Optional filters.
   * @returns        Filtered, unsolved {@link CFProblemRef} array.
   *
   * @example
   * ```ts
   * const unsolved = await analytics.getUniqueUnsolvedProblems('tourist', {
   *   platform: 'CODEFORCES',
   *   minRating: 2000,
   *   maxRating: 2400,
   *   tags: ['dp', 'graphs'],
   * });
   * ```
   */
  async getUniqueUnsolvedProblems(
    handle: string,
    options?: {
      platform: 'CODEFORCES';
      minRating?: number;
      maxRating?: number;
      tags?: string[];
    },
  ): Promise<CFProblemRef[]> {
    const [submissions, allProblems] = await Promise.all([
      this.cf.getSubmissions(handle, { count: 10000 }),
      this.cf.getProblems(),
    ]);

    const solved = extractSolvedKeys(submissions);

    const minRating = options?.minRating;
    const maxRating = options?.maxRating;
    const requiredTags = options?.tags?.map((t) => t.toLowerCase());

    const unsolved: CFProblemRef[] = [];

    for (const p of allProblems) {
      const key = `${p.contestId}${p.index}`;

      // Skip already solved.
      if (solved.has(key)) continue;

      // Rating range filter.
      if (minRating !== undefined && (p.rating === undefined || p.rating < minRating)) continue;
      if (maxRating !== undefined && (p.rating === undefined || p.rating > maxRating)) continue;

      // Tags filter — problem must include ALL requested tags.
      if (requiredTags && requiredTags.length > 0) {
        const problemTags = (p.tags ?? []).map((t) => t.toLowerCase());
        const hasAll = requiredTags.every((rt) => problemTags.includes(rt));
        if (!hasAll) continue;
      }

      unsolved.push(toCFProblemRef(p));
    }

    // Sort by rating ascending, problems without rating go last.
    unsolved.sort((a, b) => {
      if (a.rating === undefined && b.rating === undefined) return a.id.localeCompare(b.id);
      if (a.rating === undefined) return 1;
      if (b.rating === undefined) return -1;
      return a.rating - b.rating;
    });

    return unsolved;
  }

  // -------------------------------------------------------------------------
  // 4. getRatingProgress
  // -------------------------------------------------------------------------

  /**
   * Retrieve a user's rating history and compute progress over an optional
   * date window `[fromDate, toDate]`.
   *
   * - **Codeforces**: uses `user.rating` API endpoint.
   * - **AtCoder**: uses `getUserRatingHistory` which reads the AtCoder
   *   history JSON endpoint.
   *
   * When no date window is specified the full available history is returned.
   *
   * @param handle  Handle on the given platform.
   * @param options Platform selector and optional date range.
   * @returns       {@link RatingProgress} including timeline and delta.
   *
   * @example
   * ```ts
   * const progress = await analytics.getRatingProgress('tourist', {
   *   platform: 'CODEFORCES',
   *   fromDate: new Date('2024-01-01'),
   * });
   * console.log(progress.delta); // +NNN
   * ```
   */
  async getRatingProgress(
    handle: string,
    options: {
      platform: 'CODEFORCES' | 'ATCODER';
      fromDate?: Date;
      toDate?: Date;
    },
  ): Promise<RatingProgress> {
    const { platform, fromDate, toDate } = options;

    if (platform === 'CODEFORCES') {
      return this._cfRatingProgress(handle, fromDate, toDate);
    }
    return this._acRatingProgress(handle, fromDate, toDate);
  }

  /** @internal Codeforces rating progress implementation. */
  private async _cfRatingProgress(
    handle: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<RatingProgress> {
    // CF provides user.rating which returns all rating changes.
    const { default: axios } = await import('axios');
    const response = await axios.get(
      `https://codeforces.com/api/user.rating?handle=${encodeURIComponent(handle)}`,
      { timeout: 10_000 },
    );

    if (response.data.status !== 'OK') {
      throw new Error(`Codeforces API error: ${response.data.comment}`);
    }

    // Raw shape: { contestId, contestName, ratingUpdateTimeSeconds, oldRating, newRating }[]
    const raw: Array<{
      contestId: number;
      contestName: string;
      ratingUpdateTimeSeconds: number;
      oldRating: number;
      newRating: number;
    }> = response.data.result;

    let filtered = raw;
    if (fromDate) {
      const fromSec = Math.floor(fromDate.getTime() / 1000);
      filtered = filtered.filter((e) => e.ratingUpdateTimeSeconds >= fromSec);
    }
    if (toDate) {
      const toSec = Math.floor(toDate.getTime() / 1000);
      filtered = filtered.filter((e) => e.ratingUpdateTimeSeconds <= toSec);
    }

    const history = filtered.map((e) => ({
      date: new Date(e.ratingUpdateTimeSeconds * 1000),
      rating: e.newRating,
      contestName: e.contestName,
    }));

    const startRating = filtered.length > 0 ? filtered[0].oldRating : 0;
    const endRating = filtered.length > 0 ? filtered[filtered.length - 1].newRating : 0;

    return {
      startRating,
      endRating,
      delta: endRating - startRating,
      history,
    };
  }

  /** @internal AtCoder rating progress implementation. */
  private async _acRatingProgress(
    handle: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<RatingProgress> {
    // Returns raw entries: { IsRated, Place, OldRating, NewRating, Performance, ContestName, EndTime, … }
    const raw = await this.ac.getUserRatingHistory(handle);

    let filtered = raw;
    if (fromDate) {
      filtered = filtered.filter(
        (e: any) => new Date(e.EndTime).getTime() >= fromDate.getTime(),
      );
    }
    if (toDate) {
      filtered = filtered.filter(
        (e: any) => new Date(e.EndTime).getTime() <= toDate.getTime(),
      );
    }

    const history = filtered.map((e: any) => ({
      date: new Date(e.EndTime),
      rating: e.NewRating ?? 0,
      contestName: e.ContestName ?? '',
    }));

    const startRating: number = filtered.length > 0 ? (filtered[0].OldRating ?? 0) : 0;
    const endRating: number =
      filtered.length > 0 ? (filtered[filtered.length - 1].NewRating ?? 0) : 0;

    return {
      startRating,
      endRating,
      delta: endRating - startRating,
      history,
    };
  }

  // -------------------------------------------------------------------------
  // 5. getTagDistribution
  // -------------------------------------------------------------------------

  /**
   * Compute a **tag frequency map** for a Codeforces user: how many unique
   * problems the user has solved in each tag category.
   *
   * Each accepted problem is counted once per tag it carries (a single problem
   * may contribute to multiple tag buckets). Duplicate accepted submissions for
   * the same problem are de-duplicated before counting.
   *
   * Tags are sourced from the canonical problemset (cached) and joined against
   * the user's solved set, ensuring accurate data even when the user.status
   * endpoint omits tag info.
   *
   * @param handle CF handle.
   * @returns      `Record<tag, solvedCount>` sorted by count descending.
   *
   * @example
   * ```ts
   * const dist = await analytics.getTagDistribution('tourist');
   * // { 'constructive algorithms': 342, 'math': 298, … }
   * ```
   */
  async getTagDistribution(handle: string): Promise<Record<string, number>> {
    const [submissions, allProblems] = await Promise.all([
      this.cf.getSubmissions(handle, { count: 10000 }),
      this.cf.getProblems(),
    ]);

    // Build problem-tag lookup from the canonical problemset.
    const tagMap = new Map<string, string[]>();
    for (const p of allProblems) {
      tagMap.set(`${p.contestId}${p.index}`, p.tags ?? []);
    }

    const counted = new Set<string>();
    const tagCounts: Record<string, number> = {};

    for (const s of submissions) {
      if (s.verdict !== 'OK') continue;

      const key = cfProblemKey(s.problem);
      if (counted.has(key)) continue;
      counted.add(key);

      const tags = tagMap.get(key) ?? [];
      for (const tag of tags) {
        tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      }
    }

    // Sort by count descending.
    return Object.fromEntries(
      Object.entries(tagCounts).sort(([, a], [, b]) => b - a),
    );
  }

  // -------------------------------------------------------------------------
  // 6. getDifficultyDistribution
  // -------------------------------------------------------------------------

  /**
   * Compute how many **unique** problems the user has solved in each Codeforces
   * rating bucket.
   *
   * Problems without a rating are silently omitted (unrated problems don't fit
   * any bucket). Ratings are sourced from the canonical problemset (cached).
   *
   * @param handle   CF handle.
   * @param platform Must be `'CODEFORCES'`.
   * @returns        {@link DifficultyDistribution} bucket counts.
   *
   * @example
   * ```ts
   * const dist = await analytics.getDifficultyDistribution('tourist', 'CODEFORCES');
   * // { '<800': 5, '800-1199': 12, '1200-1599': 40, … }
   * ```
   */
  async getDifficultyDistribution(
    handle: string,
    platform: 'CODEFORCES',
  ): Promise<DifficultyDistribution> {
    const [submissions, allProblems] = await Promise.all([
      this.cf.getSubmissions(handle, { count: 10000 }),
      this.cf.getProblems(),
    ]);

    // Build problem-rating lookup from the canonical problemset.
    const ratingMap = new Map<string, number>();
    for (const p of allProblems) {
      if (p.rating !== undefined) {
        ratingMap.set(`${p.contestId}${p.index}`, p.rating);
      }
    }

    const buckets: DifficultyDistribution = {
      '<800': 0,
      '800-1199': 0,
      '1200-1599': 0,
      '1600-1999': 0,
      '2000-2399': 0,
      '2400+': 0,
    };

    const counted = new Set<string>();

    for (const s of submissions) {
      if (s.verdict !== 'OK') continue;

      const key = cfProblemKey(s.problem);
      if (counted.has(key)) continue;
      counted.add(key);

      // Prefer rating from the canonical problemset; fall back to submission data.
      const rating = ratingMap.get(key) ?? s.problem.rating;
      if (rating === undefined) continue;

      if (rating < 800) buckets['<800']++;
      else if (rating < 1200) buckets['800-1199']++;
      else if (rating < 1600) buckets['1200-1599']++;
      else if (rating < 2000) buckets['1600-1999']++;
      else if (rating < 2400) buckets['2000-2399']++;
      else buckets['2400+']++;
    }

    return buckets;
  }
}
