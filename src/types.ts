export type Platform = 'CODEFORCES' | 'ATCODER' | 'CODECHEF' | 'LEETCODE';

// ─── Contest ────────────────────────────────────────────────────────────────

export interface UnifiedContest {
  platform: Platform;
  id: string | number;
  name: string;
  url: string;
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
}

// ─── Fetch Options ───────────────────────────────────────────────────────────

export interface FetchOptions {
  /** Filter contests whose names contain any of these keywords (case-insensitive) */
  keywords?: string[];
  /** Max number of results to return */
  limit?: number;
  /** Include ongoing contests */
  includeOngoing?: boolean;
  /** Include past contests */
  includePast?: boolean;
  /** Only include these platforms */
  platforms?: Platform[];
}

// ─── Rate Limiter ────────────────────────────────────────────────────────────

export type RateLimitStrategy = 'token-bucket' | 'fixed-window';
export type RateLimitOnExceeded = 'wait' | 'throw' | 'skip';

export interface PlatformRateLimitConfig {
  /** Requests per second allowed */
  requestsPerSecond?: number;
  /** Max burst requests before rate limiting kicks in */
  burst?: number;
}

export interface RateLimitConfig {
  /** Enable rate limiting (default: true) */
  enabled: boolean;
  /** Algorithm to use (default: 'token-bucket') */
  strategy?: RateLimitStrategy;
  /** What to do when rate limit is hit (default: 'wait') */
  onRateLimit?: RateLimitOnExceeded;
  /** Maximum time to wait in ms before giving up (default: 30000) */
  maxWaitMs?: number;
  /** Per-platform overrides */
  platforms?: {
    codeforces?: PlatformRateLimitConfig;
    atcoder?: PlatformRateLimitConfig;
    codechef?: PlatformRateLimitConfig;
    leetcode?: PlatformRateLimitConfig;
  };
}

// ─── HTTP Config ─────────────────────────────────────────────────────────────

export interface HttpConfig {
  /** Request timeout in ms (default: 15000) */
  timeout: number;
  /** Max number of retries on failure (default: 3) */
  maxRetries: number;
  /** Base delay between retries in ms — exponential backoff applied (default: 1000) */
  retryDelay: number;
  /** User-Agent string sent with all requests */
  userAgent: string;
  /** HTTP proxy URL (optional) */
  proxy?: string;
}

// ─── Cache Config ────────────────────────────────────────────────────────────

export interface CacheConfig {
  /** Enable caching (default: true) */
  enabled: boolean;
  /** Default TTL for cached items in ms (default: 300000 = 5 min) */
  ttlMs: number;
  /** Max number of items in the LRU cache (default: 500) */
  maxSize?: number;
}

// ─── Events & Logging ─────────────────────────────────────────────────────────

export interface EventsConfig {
  /** Enable event emission (default: false) */
  enabled: boolean;
}

export interface LoggingConfig {
  /** Enable internal logging (default: false) */
  enabled: boolean;
  /** Log level */
  level?: 'debug' | 'info' | 'warn' | 'error';
}

// ─── Global Config ───────────────────────────────────────────────────────────

export interface GlobalConfig {
  cache: CacheConfig;
  rateLimit: RateLimitConfig;
  http: HttpConfig;
  events: EventsConfig;
  logging: LoggingConfig;
}

// ─── Unified Users ───────────────────────────────────────────────────────────

export interface SolvedProblemsFilter {
  minRating?: number;
  maxRating?: number;
  tags?: string[];
}

export interface UnifiedUserOptions {
  /** Which platforms to query (default: all) */
  platforms?: Platform[];
  /** Fetch recent submissions */
  includeSubmissions?: boolean;
  /** Fetch rating history timeline */
  includeRatingHistory?: boolean;
  /** Fetch list of solved problems */
  includeSolvedProblems?: boolean;
  /** Fetch current + longest streak */
  includeStreak?: boolean;
  /** Fetch daily activity heatmap */
  includeActivityHeatmap?: boolean;
  /** Fetch contest participation history */
  includeContestHistory?: boolean;
  /** Max submissions to return */
  submissionsLimit?: number;
  /** Filters applied to solved problems */
  solvedProblemsFilters?: SolvedProblemsFilter;
}

export interface UnifiedUserPlatformData {
  rating?: number;
  maxRating?: number;
  rank?: string;
  submissions?: any[];
  ratingHistory?: any[];
  solvedProblems?: any[];
  streak?: { current: number; longest: number };
  activityHeatmap?: Record<string, number>;
  contestHistory?: any[];
}

export interface UnifiedUser {
  handle: string;
  codeforces?: UnifiedUserPlatformData;
  atcoder?: UnifiedUserPlatformData;
  leetcode?: UnifiedUserPlatformData;
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface HealthResult {
  platform: string;
  reachable: boolean;
  latencyMs: number;
  timestamp: Date;
  error?: string;
}

export interface RatingProgressResult {
  startRating: number;
  endRating: number;
  delta: number;
  history: Array<{ date: Date; rating: number; contestName: string }>;
}

export interface DifficultyDistribution {
  '<800': number;
  '800-1199': number;
  '1200-1599': number;
  '1600-1999': number;
  '2000-2399': number;
  '2400+': number;
}
