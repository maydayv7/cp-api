/**
 * @file platformHttpClient.ts
 * @description Manages configured HTTP clients for CP-API platforms
 *
 * Each platform gets one process-local {@link HttpClient} and, when enabled,
 * one {@link RateLimiter}. Clients are created lazily and rebuilt whenever the
 * relevant global HTTP or rate-limit configuration changes. Rebuilding also
 * destroys the previous limiter so its refill timer and waiting queue do not
 * outlive the client that owns it.
 */

import { getConfig } from "../config";
import { HttpClient } from "./httpClient";
import { RateLimiter } from "./rateLimiter";

/** Platform keys supported by the global rate-limit configuration */
export type HttpPlatform = "codeforces" | "atcoder" | "codechef" | "leetcode";

/** Cached client state used to detect configuration changes */
type ClientEntry = {
  /** Serialized HTTP and platform rate-limit configuration */
  signature: string;
  /** Shared HTTP client for this platform in the current process */
  client: HttpClient;
  /** Limiter owned by the client, if rate limiting is enabled */
  limiter?: RateLimiter;
};

/** Lazily populated process-local client registry */
const clients = new Map<HttpPlatform, ClientEntry>();

/**
 * Return the current entry for a platform, rebuilding it when configuration
 * has changed since the previous request.
 */
function createClient(platform: HttpPlatform): ClientEntry {
  const config = getConfig();
  const platformLimit = config.rateLimit.platforms?.[platform];

  // Only settings that affect the client belong in the identity signature
  const signature = JSON.stringify({
    http: config.http,
    rateLimit: config.rateLimit.enabled
      ? {
          strategy: config.rateLimit.strategy,
          onRateLimit: config.rateLimit.onRateLimit,
          maxWaitMs: config.rateLimit.maxWaitMs,
          platform: platformLimit,
        }
      : { enabled: false },
  });

  const existing = clients.get(platform);
  if (existing?.signature === signature) return existing;

  existing?.limiter?.destroy();

  const limiter =
    config.rateLimit.enabled && platformLimit?.requestsPerSecond
      ? new RateLimiter({
          platform,
          requestsPerSecond: platformLimit.requestsPerSecond,
          burst: platformLimit.burst,
          strategy: config.rateLimit.strategy,
          onRateLimit: config.rateLimit.onRateLimit,
          maxWaitMs: config.rateLimit.maxWaitMs,
        })
      : undefined;

  const entry: ClientEntry = {
    signature,
    limiter,
    client: new HttpClient({
      platform,
      timeout: config.http.timeout,
      maxRetries: config.http.maxRetries,
      retryDelay: config.http.retryDelay,
      userAgent: config.http.userAgent,
      proxy: parseProxy(config.http.proxy),
      rateLimiter: limiter,
    }),
  };
  clients.set(platform, entry);
  return entry;
}

export function parseProxy(proxy?: string) {
  if (!proxy) return undefined;
  const url = new URL(proxy);
  return {
    protocol: url.protocol.slice(0, -1),
    host: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80,
    auth: url.username
      ? {
          username: decodeURIComponent(url.username),
          password: decodeURIComponent(url.password),
        }
      : undefined,
  };
}

/**
 * Return the shared, configured HTTP client for a platform
 *
 * @param platform Platform whose HTTP and rate-limit settings should be used
 */
export function getPlatformHttpClient(platform: HttpPlatform): HttpClient {
  return createClient(platform).client;
}

/**
 * Destroy all limiter timers and clear the client registry
 * @internal Primarily used by CP-API reset handling and isolated tests.
 */
export function resetPlatformHttpClients(): void {
  for (const entry of clients.values()) entry.limiter?.destroy();
  clients.clear();
}
