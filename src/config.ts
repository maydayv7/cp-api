import { GlobalConfig, RateLimitConfig, HttpConfig, CacheConfig } from './types';

export type { CacheConfig };

export const defaultConfig: GlobalConfig = {
  cache: {
    enabled: true,
    ttlMs: 5 * 60 * 1000, // 5 minutes
    maxSize: 500,
  },
  rateLimit: {
    enabled: true,
    strategy: 'token-bucket',
    onRateLimit: 'wait',
    maxWaitMs: 30_000,
    platforms: {
      codeforces: { requestsPerSecond: 1, burst: 5 },
      atcoder:    { requestsPerSecond: 0.5, burst: 3 },
      codechef:   { requestsPerSecond: 2, burst: 5 },
      leetcode:   { requestsPerSecond: 1, burst: 3 },
    },
  },
  http: {
    timeout: 15_000,
    maxRetries: 3,
    retryDelay: 1_000,
    userAgent: 'Mozilla/5.0 (compatible; @ronit/cp-api)',
  },
  events: {
    enabled: false,
  },
  logging: {
    enabled: false,
    level: 'info',
  },
};

let currentConfig: GlobalConfig = JSON.parse(JSON.stringify(defaultConfig));

/**
 * Configure the global @ronit/cp-api client.
 *
 * @example
 * cp.configure({
 *   rateLimit: { enabled: true, onRateLimit: 'wait' },
 *   cache: { ttlMs: 60_000 },
 *   logging: { enabled: true, level: 'debug' },
 * });
 */
export function configure(config: DeepPartial<GlobalConfig>): void {
  currentConfig = deepMerge(currentConfig, config) as GlobalConfig;
}

export function getConfig(): GlobalConfig {
  return currentConfig;
}

export function resetConfig(): void {
  currentConfig = JSON.parse(JSON.stringify(defaultConfig));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

function deepMerge(base: any, override: any): any {
  const result = { ...base };
  for (const key of Object.keys(override ?? {})) {
    if (override[key] !== null && typeof override[key] === 'object' && !Array.isArray(override[key])) {
      result[key] = deepMerge(base[key] ?? {}, override[key]);
    } else if (override[key] !== undefined) {
      result[key] = override[key];
    }
  }
  return result;
}
