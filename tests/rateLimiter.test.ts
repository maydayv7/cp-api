import { describe, it, expect } from 'vitest';
import { RateLimiter, RateLimitError } from '../src/utils/rateLimiter';

describe('RateLimiter', () => {
  it('should allow requests within burst limit immediately', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 10, burst: 5 });
    const start = Date.now();

    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }

    const elapsed = Date.now() - start;
    // All 5 requests within burst — should be near-instant
    expect(elapsed).toBeLessThan(200);
    limiter.destroy();
  });

  it('should report status correctly', () => {
    const limiter = new RateLimiter({ requestsPerSecond: 2, burst: 4 });
    const status = limiter.getStatus();
    expect(status).toHaveProperty('tokens');
    expect(status).toHaveProperty('nextRefillMs');
    expect(status.tokens).toBeGreaterThanOrEqual(0);
    limiter.destroy();
  });

  it('should throw RateLimitError when strategy is throw and maxWaitMs exceeded', async () => {
    const limiter = new RateLimiter({
      requestsPerSecond: 0.001, // extremely slow refill
      burst: 1,
      onRateLimit: 'throw',
      maxWaitMs: 50, // throw after 50ms
    });

    await limiter.acquire(); // consume the 1 burst token

    await expect(limiter.acquire()).rejects.toBeInstanceOf(RateLimitError);
    limiter.destroy();
  });
});
