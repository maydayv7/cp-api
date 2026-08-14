import { afterEach, describe, it, expect, vi } from "vitest";
import { RateLimiter, RateLimitError } from "../src/utils/rateLimiter";

describe("RateLimiter", () => {
  afterEach(() => vi.useRealTimers());
  it("should allow requests within burst limit immediately", async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 10, burst: 5 });
    const start = Date.now();

    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }

    const elapsed = Date.now() - start;
    // All 5 requests within burst - should be near-instant
    expect(elapsed).toBeLessThan(200);
    limiter.destroy();
  });

  it("should report status correctly", () => {
    const limiter = new RateLimiter({ requestsPerSecond: 2, burst: 4 });
    const status = limiter.getStatus();
    expect(status).toHaveProperty("tokens");
    expect(status).toHaveProperty("nextRefillMs");
    expect(status.tokens).toBeGreaterThanOrEqual(0);
    limiter.destroy();
  });

  it("should throw RateLimitError when strategy is throw and maxWaitMs exceeded", async () => {
    const limiter = new RateLimiter({
      requestsPerSecond: 0.001, // extremely slow refill
      burst: 1,
      onRateLimit: "throw",
      maxWaitMs: 50, // throw after 50ms
    });

    await limiter.acquire(); // consume the 1 burst token

    await expect(limiter.acquire()).rejects.toBeInstanceOf(RateLimitError);
    limiter.destroy();
  });

  it("resets fixed windows without carrying unused capacity", async () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({
      requestsPerSecond: 2,
      burst: 2,
      strategy: "fixed-window",
      onRateLimit: "throw",
    });
    await limiter.acquire();
    await limiter.acquire();
    await expect(limiter.acquire()).rejects.toBeInstanceOf(RateLimitError);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(limiter.acquire()).resolves.toBeUndefined();
    limiter.destroy();
  });

  it("times out waiters independently of the refill interval", async () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter({
      requestsPerSecond: 0.001,
      burst: 1,
      maxWaitMs: 50,
    });
    await limiter.acquire();
    const waiting = limiter.acquire();
    const rejection = expect(waiting).rejects.toBeInstanceOf(RateLimitError);
    await vi.advanceTimersByTimeAsync(50);
    await rejection;
    limiter.destroy();
  });
});
