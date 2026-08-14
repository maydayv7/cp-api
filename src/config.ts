import { GlobalConfig, CacheConfig } from "./types";

export type { CacheConfig };

export const defaultConfig: GlobalConfig = {
  cache: {
    enabled: true,
    ttlMs: 5 * 60 * 1000, // 5 minutes
    maxSize: 500,
  },
  rateLimit: {
    enabled: true,
    strategy: "token-bucket",
    onRateLimit: "wait",
    maxWaitMs: 30_000,
    platforms: {
      codeforces: { requestsPerSecond: 0.5, burst: 1 },
      atcoder: { requestsPerSecond: 0.5, burst: 3 },
      codechef: { requestsPerSecond: 2, burst: 5 },
      leetcode: { requestsPerSecond: 1, burst: 3 },
    },
  },
  http: {
    timeout: 15_000,
    maxRetries: 3,
    retryDelay: 1_000,
    userAgent: "Mozilla/5.0 (compatible; @ronits2407/cp-api)",
  },
  events: {
    enabled: false,
  },
  logging: {
    enabled: false,
    level: "info",
  },
};

let currentConfig: GlobalConfig = JSON.parse(JSON.stringify(defaultConfig));

/**
 * Configure the global CP-API client
 *
 * @example
 * cp.configure({
 *   rateLimit: { enabled: true, onRateLimit: 'wait' },
 *   cache: { ttlMs: 60_000 },
 *   logging: { enabled: true, level: 'debug' },
 * });
 */
export function configure(config: DeepPartial<GlobalConfig>): void {
  const next = deepMerge(currentConfig, config) as GlobalConfig;
  validateConfig(next);
  currentConfig = next;
}

export function getConfig(): GlobalConfig {
  return currentConfig;
}

export function resetConfig(): void {
  currentConfig = JSON.parse(JSON.stringify(defaultConfig));
}

// HELPERS

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

function deepMerge(base: any, override: any): any {
  const result = { ...base };
  for (const key of Object.keys(override ?? {})) {
    if (
      override[key] !== null &&
      typeof override[key] === "object" &&
      !Array.isArray(override[key])
    ) {
      result[key] = deepMerge(base[key] ?? {}, override[key]);
    } else if (override[key] !== undefined) {
      result[key] = override[key];
    }
  }
  return result;
}

function positive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive finite number`);
  }
}

function validateConfig(config: GlobalConfig): void {
  positive(config.cache.ttlMs, "cache.ttlMs");
  if (config.cache.maxSize !== undefined)
    positive(config.cache.maxSize, "cache.maxSize");
  positive(config.http.timeout, "http.timeout");
  if (!Number.isInteger(config.http.maxRetries) || config.http.maxRetries < 0)
    throw new TypeError("http.maxRetries must be a non-negative integer");
  if (!Number.isFinite(config.http.retryDelay) || config.http.retryDelay < 0)
    throw new TypeError("http.retryDelay must be a non-negative finite number");
  if (config.http.proxy) {
    const proxy = new URL(config.http.proxy);
    if (proxy.protocol !== "http:" && proxy.protocol !== "https:")
      throw new TypeError("http.proxy must use http or https");
    if (!proxy.hostname) throw new TypeError("http.proxy must include a host");
  }
  if (
    config.rateLimit.maxWaitMs !== undefined &&
    (!Number.isFinite(config.rateLimit.maxWaitMs) ||
      config.rateLimit.maxWaitMs < 0)
  )
    throw new TypeError("rateLimit.maxWaitMs must be non-negative");
  for (const [platform, limit] of Object.entries(
    config.rateLimit.platforms ?? {},
  )) {
    if (limit.requestsPerSecond !== undefined)
      positive(
        limit.requestsPerSecond,
        `rateLimit.platforms.${platform}.requestsPerSecond`,
      );
    if (limit.burst !== undefined)
      positive(limit.burst, `rateLimit.platforms.${platform}.burst`);
  }
}
