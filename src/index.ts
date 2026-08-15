/**
 * @ronits2407/cp-api
 *
 * One unified, fault-tolerant SDK to fetch upcoming contests, user profiles,
 * problem sets, submissions, and analytics from all major competitive
 * programming platforms.
 *
 * @example
 * import { cp } from '@ronits2407/cp-api';
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

// PLATFORM WRAPPERS
import { Codeforces } from "./platforms/codeforces";
import { AtCoder } from "./platforms/atcoder";
import { CodeChef } from "./platforms/codechef";
import { LeetCode } from "./platforms/leetcode";

// UNIFIED APIs
import { Contests } from "./unified/contests";
import { Users } from "./unified/users";
import { Analytics } from "./unified/analytics";
import { Health } from "./unified/health";

// CONFIG
import { configure, getConfig, resetConfig } from "./config";
export { defaultConfig } from "./config";

// UTILITIES
import { clearCache, invalidate, getCacheSize } from "./cache";
import { onEvent, offEvent } from "./utils/events";
export { cpEvents, emitEvent } from "./utils/events";
export { RateLimiter, RateLimitError } from "./utils/rateLimiter";
export type {
  RateLimiterConfig,
  RateLimiterStatus,
  RateLimiterStrategy,
  RateLimitAction,
} from "./utils/rateLimiter";
export { HttpClient } from "./utils/httpClient";
export type { HttpClientConfig } from "./utils/httpClient";
export type {
  CPEventListener,
  CPEventMap,
  CPEventName,
  CPEventPayload,
  FetchRetryEventPayload,
} from "./utils/events";
import { resetPlatformHttpClients } from "./utils/platformHttpClient";

// TYPES
export * from "./types";
export type {
  ProblemContent,
  ProblemContentFetcher,
  ProblemContentPlatform,
  ProblemSample,
} from "./problemContent";
export { ProblemContentAccessError } from "./problemContent";

// Platform types
export type {
  CFUserInfo,
  CFSubmission,
  CFProblem,
  CFContest,
  CFRatingChange,
  CFHackResult,
  CFBlogEntry,
  CFStandings,
  CFProblemFilters,
  CFProblemContentOptions,
  CFSubmissionFilters,
} from "./platforms/codeforces";
export { getCFRankFromRating, getCFRatingColor } from "./platforms/codeforces";

export type {
  ACProblem,
  ACProblemModel,
  ACSubmission,
  ACUserInfo,
  ACRatingHistoryEntry,
  ACProblemFilters,
  ACSubmissionFilters,
} from "./platforms/atcoder";
export { getACRankFromRating, getACRatingColor } from "./platforms/atcoder";

// CP Singleton
class CP {
  // Platform clients
  public readonly codeforces = new Codeforces();
  public readonly atcoder = new AtCoder();
  public readonly codechef = new CodeChef();
  public readonly leetcode = new LeetCode();

  // Unified high-level APIs
  public readonly contests = new Contests();
  public readonly users = new Users();
  public readonly analytics = new Analytics();
  public readonly health = new Health();

  // Config management
  public configure = configure;
  public getConfig = getConfig;
  public resetConfig(): void {
    resetConfig();
    resetPlatformHttpClients();
    clearCache();
  }

  // Cache management
  public clearCache = clearCache;
  public invalidateCache = invalidate;
  public getCacheSize = getCacheSize;

  // Events
  public on = onEvent;
  public off = offEvent;
}

/**
 * The main CP-API client
 * Import and use directly.
 * */
export const cp = new CP();
export default cp;
