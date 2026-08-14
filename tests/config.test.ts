import { describe, it, expect, beforeEach } from "vitest";
import { configure, getConfig, resetConfig } from "../src/config";
import type { CacheConfig } from "../src/types";

describe("Configuration", () => {
  beforeEach(() => {
    resetConfig();
  });

  it("should have default configuration", () => {
    const config = getConfig();
    expect(config.http.timeout).toBe(15_000);
    expect(config.http.maxRetries).toBe(3);
    expect(config.cache.enabled).toBe(true);
    expect(config.cache.ttlMs).toBe(5 * 60 * 1000);
    expect(config.cache.maxSize).toBe(500);
    expect(config.rateLimit.enabled).toBe(true);
    expect(config.rateLimit.strategy).toBe("token-bucket");
    expect(config.rateLimit.onRateLimit).toBe("wait");
    expect(config.rateLimit.platforms?.codeforces).toEqual({
      requestsPerSecond: 0.5,
      burst: 1,
    });
    expect(config.logging.enabled).toBe(false);
    expect(config.events.enabled).toBe(false);
  });

  it("keeps maxSize optional for source compatibility", () => {
    const cache: CacheConfig = { enabled: true, ttlMs: 1_000 };
    configure({ cache });
    expect(getConfig().cache.maxSize).toBe(500);
  });

  it("should deep-merge partial updates", () => {
    configure({
      http: { timeout: 5000 },
      rateLimit: { enabled: false },
      logging: { enabled: true, level: "debug" },
    });

    const config = getConfig();
    expect(config.http.timeout).toBe(5000);
    expect(config.http.maxRetries).toBe(3); // unchanged
    expect(config.rateLimit.enabled).toBe(false);
    expect(config.logging.enabled).toBe(true);
    expect(config.logging.level).toBe("debug");
    expect(config.cache.enabled).toBe(true); // unchanged
  });

  it("should reset to defaults", () => {
    configure({ http: { timeout: 1000 } });
    resetConfig();
    expect(getConfig().http.timeout).toBe(15_000);
  });

  it("should support per-platform rate limit config", () => {
    configure({
      rateLimit: {
        enabled: true,
        platforms: {
          codeforces: { requestsPerSecond: 0.5, burst: 2 },
        },
      },
    });
    const config = getConfig();
    expect(config.rateLimit.platforms?.codeforces?.requestsPerSecond).toBe(0.5);
    expect(config.rateLimit.platforms?.codeforces?.burst).toBe(2);
    // Others should remain at defaults
    expect(config.rateLimit.platforms?.atcoder?.requestsPerSecond).toBe(0.5);
  });

  it("rejects invalid numeric and proxy configuration", () => {
    expect(() => configure({ cache: { maxSize: 0 } })).toThrow(TypeError);
    expect(() =>
      configure({ http: { proxy: "socks://localhost:1080" } }),
    ).toThrow(TypeError);
  });
});
