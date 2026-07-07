/**
 * @ronit/cp-api
 *
 * One unified, fault-tolerant SDK to fetch upcoming contests, user profiles,
 * problem sets, submissions, and analytics from all major competitive
 * programming platforms.
 *
 * @example
 * import { cp } from '@ronit/cp-api';
 *
 * // Configure once
 * cp.configure({
 *   rateLimit: { enabled: true, onRateLimit: 'wait' },
 *   cache: { ttlMs: 60_000 },
 *   logging: { enabled: true, level: 'info' },
 * });
 *
 * // Unified multi-platform contest feed
 * const contests = await cp.contests.getUpcoming({ limit: 10 });
 *
 * // Single-line user profile across platforms
 * const profile = await cp.users.get('tourist', {
 *   platforms: ['CODEFORCES', 'ATCODER'],
 *   includeSubmissions: true,
 *   includeStreak: true,
 *   includeRatingHistory: true,
 * });
 *
 * // Platform-specific deep dives
 * const heatmap = await cp.codeforces.getUserActivityHeatmap('tourist');
 * const solved  = await cp.atcoder.getUserSolvedProblems('tourist', { minDifficulty: 1200 });
 *
 * // Analytics
 * const comparison  = await cp.analytics.compareUsers(['tourist', 'jiangly'], 'CODEFORCES');
 * const tagDist     = await cp.analytics.getTagDistribution('tourist');
 * const diffDist    = await cp.analytics.getDifficultyDistribution('tourist', 'CODEFORCES');
 *
 * // Health checks
 * const health = await cp.health.check();
 * console.log(health);
 * // [{ platform: 'CODEFORCES', reachable: true, latencyMs: 123, ... }, ...]
 */

// ─── Platform Wrappers ────────────────────────────────────────────────────────
import { Codeforces } from './platforms/codeforces';
import { AtCoder }    from './platforms/atcoder';
import { CodeChef }   from './platforms/codechef';
import { LeetCode }   from './platforms/leetcode';

// ─── Unified APIs ─────────────────────────────────────────────────────────────
import { Contests }   from './unified/contests';
import { Users }      from './unified/users';
import { Analytics }  from './unified/analytics';
import { Health }     from './unified/health';

// ─── Config ───────────────────────────────────────────────────────────────────
import { configure, getConfig, resetConfig, defaultConfig } from './config';

// ─── Utilities ────────────────────────────────────────────────────────────────
import { clearCache, invalidate, getCacheSize }         from './cache';
import { cpEvents, onEvent, offEvent, emitEvent }       from './utils/events';
import { RateLimiter, RateLimitError }                  from './utils/rateLimiter';
import { HttpClient }                                   from './utils/httpClient';

// ─── Public Type Re-exports ───────────────────────────────────────────────────
export * from './types';

// Platform types
export type { CFUserInfo, CFSubmission, CFProblem, CFContest, CFRatingChange,
              CFHackResult, CFBlogEntry, CFStandings, CFProblemFilters, CFSubmissionFilters }
  from './platforms/codeforces';
export { getCFRankFromRating, getCFRatingColor } from './platforms/codeforces';

export type { ACProblem, ACProblemModel, ACSubmission, ACUserInfo,
              ACRatingHistoryEntry, ACProblemFilters, ACSubmissionFilters }
  from './platforms/atcoder';
export { getACRankFromRating, getACRatingColor } from './platforms/atcoder';

// Utils
export { RateLimiter, RateLimitError }  from './utils/rateLimiter';
export { HttpClient }                   from './utils/httpClient';
export { cpEvents, onEvent, offEvent, emitEvent } from './utils/events';

// Cache helpers
export { clearCache, invalidate, getCacheSize } from './cache';

// ─── CP Singleton ─────────────────────────────────────────────────────────────

class CP {
  // Platform clients
  public readonly codeforces = new Codeforces();
  public readonly atcoder    = new AtCoder();
  public readonly codechef   = new CodeChef();
  public readonly leetcode   = new LeetCode();

  // Unified high-level APIs
  public readonly contests  = new Contests();
  public readonly users     = new Users();
  public readonly analytics = new Analytics();
  public readonly health    = new Health();

  // Config management
  public configure  = configure;
  public getConfig  = getConfig;
  public resetConfig = resetConfig;

  // Cache management
  public clearCache = clearCache;
  public invalidateCache = invalidate;
  public getCacheSize = getCacheSize;

  // Events
  public on  = onEvent;
  public off = offEvent;
}

/** The main @ronit/cp-api client. Import and use directly. */
export const cp = new CP();
export default cp;
