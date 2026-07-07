/**
 * Unified Users API
 * Single method to fetch a normalized user profile across all CP platforms.
 */
import { Codeforces } from '../platforms/codeforces';
import { AtCoder } from '../platforms/atcoder';
import { UnifiedUserOptions, UnifiedUser, UnifiedUserPlatformData, SolvedProblemsFilter } from '../types';

export class Users {
  private cf = new Codeforces();
  private ac = new AtCoder();

  /**
   * Fetch a comprehensive user profile across multiple platforms with configurable boolean flags.
   *
   * @example
   * const profile = await cp.users.get('tourist', {
   *   platforms: ['CODEFORCES', 'ATCODER'],
   *   includeSubmissions: true,
   *   includeRatingHistory: true,
   *   includeSolvedProblems: true,
   *   includeStreak: true,
   *   includeActivityHeatmap: true,
   *   submissionsLimit: 100,
   * });
   *
   * console.log(profile.codeforces.rating);          // 3439
   * console.log(profile.atcoder.rank);               // 'Red'
   * console.log(profile.codeforces.streak.current);  // 14
   */
  async get(handle: string, options: UnifiedUserOptions = {}): Promise<UnifiedUser> {
    const {
      platforms = ['CODEFORCES', 'ATCODER'],
      includeSubmissions = false,
      includeRatingHistory = false,
      includeSolvedProblems = false,
      includeStreak = false,
      includeActivityHeatmap = false,
      includeContestHistory = false,
      submissionsLimit = 100,
      solvedProblemsFilters = {},
    } = options;

    const profile: UnifiedUser = { handle };
    const tasks: Promise<void>[] = [];

    if (platforms.includes('CODEFORCES')) {
      tasks.push(this._fetchCodeforces(handle, profile, {
        includeSubmissions, includeRatingHistory, includeSolvedProblems,
        includeStreak, includeActivityHeatmap, includeContestHistory,
        submissionsLimit, solvedProblemsFilters,
      }));
    }

    if (platforms.includes('ATCODER')) {
      tasks.push(this._fetchAtCoder(handle, profile, {
        includeSubmissions, includeRatingHistory, includeSolvedProblems,
        includeStreak, submissionsLimit, solvedProblemsFilters,
      }));
    }

    // Note: CodeChef and LeetCode user profile APIs require authentication;
    // they are supported at the platform level but not yet in unified users.

    await Promise.allSettled(tasks);
    return profile;
  }

  private async _fetchCodeforces(
    handle: string,
    profile: UnifiedUser,
    opts: Required<Omit<UnifiedUserOptions, 'platforms'>>
  ): Promise<void> {
    try {
      const users = await this.cf.getUser(handle);
      if (!users?.length) return;
      const u = users[0];

      const data: UnifiedUserPlatformData = {
        rating: u.rating,
        maxRating: u.maxRating,
        rank: u.rank,
      };

      const parallel: Promise<void>[] = [];

      if (opts.includeSubmissions) {
        parallel.push(
          this.cf.getSubmissions(handle, { count: opts.submissionsLimit })
            .then(s => { data.submissions = s; })
            .catch(() => {})
        );
      }

      if (opts.includeRatingHistory) {
        parallel.push(
          this.cf.getUserRatingHistory(handle)
            .then(h => { data.ratingHistory = h; })
            .catch(() => {})
        );
      }

      if (opts.includeSolvedProblems) {
        parallel.push(
          this.cf.getUserSolvedProblems(handle, opts.solvedProblemsFilters as any)
            .then(p => { data.solvedProblems = p; })
            .catch(() => {})
        );
      }

      if (opts.includeStreak) {
        parallel.push(
          this.cf.getUserStreak(handle)
            .then(s => { data.streak = s; })
            .catch(() => {})
        );
      }

      if (opts.includeActivityHeatmap) {
        parallel.push(
          this.cf.getUserActivityHeatmap(handle)
            .then(h => { data.activityHeatmap = h; })
            .catch(() => {})
        );
      }

      if (opts.includeContestHistory) {
        parallel.push(
          this.cf.getUserRatingHistory(handle)
            .then(h => { data.contestHistory = h; })
            .catch(() => {})
        );
      }

      await Promise.allSettled(parallel);
      profile.codeforces = data;
    } catch { /* silently skip if user not found */ }
  }

  private async _fetchAtCoder(
    handle: string,
    profile: UnifiedUser,
    opts: Pick<Required<UnifiedUserOptions>, 'includeSubmissions' | 'includeRatingHistory' | 'includeSolvedProblems' | 'includeStreak' | 'submissionsLimit' | 'solvedProblemsFilters'>
  ): Promise<void> {
    try {
      const u = await this.ac.getUser(handle);
      if (!u) return;

      const data: UnifiedUserPlatformData = {
        rating: u.rating,
        maxRating: u.highest_rating,
        rank: this.ac.getRankFromRating(u.rating),
      };

      const parallel: Promise<void>[] = [];

      if (opts.includeSubmissions) {
        parallel.push(
          this.ac.getUserSubmissions(handle)
            .then(s => { data.submissions = s.slice(0, opts.submissionsLimit); })
            .catch(() => {})
        );
      }

      if (opts.includeRatingHistory) {
        parallel.push(
          this.ac.getUserRatingHistory(handle)
            .then(h => { data.ratingHistory = h; })
            .catch(() => {})
        );
      }

      if (opts.includeSolvedProblems) {
        parallel.push(
          this.ac.getUserSolvedProblems(handle, opts.solvedProblemsFilters as any)
            .then(p => { data.solvedProblems = p; })
            .catch(() => {})
        );
      }

      if (opts.includeStreak) {
        parallel.push(
          this.ac.getUserStreak(handle)
            .then(s => { data.streak = s; })
            .catch(() => {})
        );
      }

      await Promise.allSettled(parallel);
      profile.atcoder = data;
    } catch { /* silently skip */ }
  }
}
