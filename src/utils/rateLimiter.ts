/**
 * @file rateLimiter.ts
 * @description Production-grade token-bucket rate limiter for CP-API
 *
 * Supports two strategies:
 *  - `token-bucket`  (default): Tokens accumulate continuously up to `burst` capacity.
 *  - `fixed-window`: The full burst allowance resets at each fixed window.
 *
 * When no token is available the limiter can:
 *  - `wait`  (default): Queue the caller and resolve as soon as a token is granted.
 *  - `throw`:           Immediately (or after maxWaitMs) throw a RateLimitError.
 *  - `skip`:            Resolve immediately without consuming a token (fire-and-forget callers).
 */

import { emitEvent } from "./events";

// ERROR

/**
 * Thrown when `onRateLimit === 'throw'` and either no token is available
 * immediately or the caller has been waiting longer than `maxWaitMs`.
 */
export class RateLimitError extends Error {
  public readonly waitedMs: number;

  constructor(message: string, waitedMs = 0) {
    super(message);
    this.name = "RateLimitError";
    this.waitedMs = waitedMs;
    // Restore prototype chain for instanceof checks in transpiled code.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// TYPES

/** Supported refill algorithms */
export type RateLimiterStrategy = "token-bucket" | "fixed-window";

/** What the rate limiter should do when no token is available */
export type RateLimitAction = "wait" | "throw" | "skip";

/** Configuration options for {@link RateLimiter}. */
export interface RateLimiterConfig {
  /** How many requests are allowed per second on a sustained basis */
  requestsPerSecond: number;

  /**
   * Maximum number of tokens that can accumulate (burst capacity)
   * Defaults to `requestsPerSecond` (i.e. no extra burst).
   */
  burst?: number;

  /**
   * Refill algorithm to use
   * @default 'token-bucket'
   */
  strategy?: RateLimiterStrategy;

  /**
   * Behaviour when no token is available
   * @default 'wait'
   */
  onRateLimit?: RateLimitAction;

  /**
   * Maximum milliseconds a caller is willing to wait before a {@link RateLimitError} is thrown
   * Only meaningful when `onRateLimit === 'throw'` or `onRateLimit === 'wait'`.
   * When omitted, callers with `onRateLimit === 'wait'` wait indefinitely.
   */
  maxWaitMs?: number;
  /** Platform name used for lifecycle events */
  platform?: string;
}

/** Snapshot of the limiter's current state */
export interface RateLimiterStatus {
  /** Current number of available tokens (may be fractional) */
  tokens: number;
  /** Milliseconds until at least one full token will be available */
  nextRefillMs: number;
}

// IMPLEMENTATION

/**
 * Token-bucket / fixed-window rate limiter
 *
 * @example
 * ```ts
 * const limiter = new RateLimiter({ requestsPerSecond: 5, burst: 10 });
 *
 * await limiter.acquire(); // blocks until a token is available
 * const res = await fetch(url);
 * ```
 */
export class RateLimiter {
  // Config
  private readonly rps: number;
  private readonly burst: number;
  private readonly strategy: RateLimiterStrategy;
  private readonly action: RateLimitAction;
  private readonly maxWaitMs: number | undefined;
  private readonly platform: string;
  private readonly fixedWindowMs: number;

  // State
  /** Current token count (fractional in token-bucket mode) */
  private tokens: number;

  /** Timestamp of the last refill (token-bucket) or window start (fixed-window) */
  private lastRefillTime: number;

  /** Queue of pending `acquire()` callers waiting for a token */
  private readonly waitQueue: Array<{
    resolve: () => void;
    reject: (err: RateLimitError) => void;
    enqueuedAt: number;
    timeout?: ReturnType<typeof setTimeout>;
  }> = [];

  /** Timer handle used to drive queue processing */
  private refillTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimiterConfig) {
    if (config.requestsPerSecond <= 0) {
      throw new Error(
        "RateLimiter: requestsPerSecond must be a positive number.",
      );
    }
    if ((config.burst ?? config.requestsPerSecond) < 1) {
      throw new Error("RateLimiter: burst must be at least 1.");
    }
    if (
      config.maxWaitMs !== undefined &&
      (!Number.isFinite(config.maxWaitMs) || config.maxWaitMs < 0)
    ) {
      throw new Error("RateLimiter: maxWaitMs must be non-negative.");
    }

    this.rps = config.requestsPerSecond;
    this.burst = config.burst ?? config.requestsPerSecond;
    this.strategy = config.strategy ?? "token-bucket";
    this.action = config.onRateLimit ?? "wait";
    this.maxWaitMs = config.maxWaitMs;
    this.platform = config.platform ?? "unknown";
    this.fixedWindowMs = (this.burst / this.rps) * 1000;

    // Start with a full bucket
    this.tokens = this.burst;
    this.lastRefillTime = Date.now();

    // Start the background refill loop
    this._startRefillLoop();
  }

  // Public API

  /**
   * Acquire a single token from the bucket
   *
   * - If a token is available it is consumed immediately and the promise resolves.
   * - If no token is available the behaviour is governed by `onRateLimit`:
   *   - `'wait'` : The promise resolves once a token becomes available (subject
   *                to `maxWaitMs` timeout when provided).
   *   - `'throw'`: A {@link RateLimitError} is thrown immediately (or after
   *                `maxWaitMs` if the caller wants to give the limiter a chance).
   *   - `'skip'` : The promise resolves immediately without consuming a token.
   */
  public async acquire(): Promise<void> {
    // Opportunistically refill before checking
    this._refill();

    if (this.tokens >= 1 && this.waitQueue.length === 0) {
      this.tokens -= 1;
      return;
    }

    emitEvent("rateLimit:hit", { platform: this.platform });

    // No token available - apply the configured action
    switch (this.action) {
      case "skip":
        return; // caller proceeds without a token

      case "throw":
        throw new RateLimitError(
          `Rate limit exceeded. No tokens available (limit: ${this.rps} req/s).`,
          0,
        );

      case "wait":
      default:
        emitEvent("rateLimit:wait", { platform: this.platform });
        return this._enqueue();
    }
  }

  /**
   * Returns a snapshot of the current limiter state
   */
  public getStatus(): RateLimiterStatus {
    this._refill();

    const tokens = Math.min(this.tokens, this.burst);
    let nextRefillMs = 0;

    if (tokens < 1) {
      if (this.strategy === "fixed-window") {
        nextRefillMs = Math.ceil(
          this.fixedWindowMs - (Date.now() - this.lastRefillTime),
        );
      } else {
        const msPerToken = 1000 / this.rps;
        const deficit = 1 - tokens;
        nextRefillMs = Math.ceil(deficit * msPerToken);
      }
    }

    return { tokens: Math.max(0, tokens), nextRefillMs };
  }

  /**
   * Stop the background refill loop and drain the wait queue with an error
   * Call this when the rate limiter is no longer needed.
   */
  public destroy(): void {
    if (this.refillTimer !== null) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }

    // Reject all waiting callers.
    const err = new RateLimitError("RateLimiter was destroyed.", 0);
    for (const waiter of this.waitQueue.splice(0)) {
      if (waiter.timeout) clearTimeout(waiter.timeout);
      waiter.reject(err);
    }
  }

  // Private helpers

  /**
   * Refill tokens based on elapsed time
   *
   * - **token-bucket**: Continuously adds `rps * elapsedSeconds` tokens,
   *   capped at `burst`.
   * - **fixed-window**: Resets the full burst allowance every `burst / rps` seconds.
   */
  private _refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime; // ms

    if (this.strategy === "fixed-window") {
      // Refill if a full second has passed since the last window
      if (elapsed >= this.fixedWindowMs) {
        this.tokens = this.burst;
        this.lastRefillTime = now - (elapsed % this.fixedWindowMs);
      }
    } else {
      // token-bucket: proportional refill
      const added = (elapsed / 1000) * this.rps;
      this.tokens = Math.min(this.burst, this.tokens + added);
      this.lastRefillTime = now;
    }
  }

  /**
   * Start the interval that periodically refills tokens and drains the queue
   * The interval runs at 4x the token refill rate for smoother draining.
   */
  private _startRefillLoop(): void {
    const intervalMs = Math.min(
      100,
      Math.max(10, Math.floor(1000 / (this.rps * 4))),
    );

    this.refillTimer = setInterval(() => {
      this._refill();
      this._drainQueue();
    }, intervalMs);

    // Don't prevent Node process from exiting.
    if ((this.refillTimer as NodeJS.Timeout).unref) {
      (this.refillTimer as NodeJS.Timeout).unref();
    }
  }

  /**
   * Attempt to grant tokens to waiting callers in FIFO order
   * Callers that have exceeded `maxWaitMs` are rejected with a RateLimitError.
   */
  private _drainQueue(): void {
    const now = Date.now();

    while (this.waitQueue.length > 0 && this.tokens >= 1) {
      const waiter = this.waitQueue[0]!;
      const waited = now - waiter.enqueuedAt;

      // Check timeout for 'wait' mode callers with maxWaitMs set.
      if (this.maxWaitMs !== undefined && waited >= this.maxWaitMs) {
        this.waitQueue.shift();
        if (waiter.timeout) clearTimeout(waiter.timeout);
        waiter.reject(
          new RateLimitError(
            `Rate limit: caller waited ${waited}ms, exceeding maxWaitMs of ${this.maxWaitMs}ms.`,
            waited,
          ),
        );
        continue;
      }

      // Grant the token.
      this.tokens -= 1;
      this.waitQueue.shift();
      if (waiter.timeout) clearTimeout(waiter.timeout);
      waiter.resolve();
    }

    // Expire timed-out callers even when no tokens are available
    if (this.maxWaitMs !== undefined) {
      let i = 0;
      while (i < this.waitQueue.length) {
        const waiter = this.waitQueue[i]!;
        const waited = now - waiter.enqueuedAt;
        if (waited >= this.maxWaitMs) {
          this.waitQueue.splice(i, 1);
          if (waiter.timeout) clearTimeout(waiter.timeout);
          waiter.reject(
            new RateLimitError(
              `Rate limit: caller waited ${waited}ms, exceeding maxWaitMs of ${this.maxWaitMs}ms.`,
              waited,
            ),
          );
        } else {
          i++;
        }
      }
    }
  }

  /**
   * Add the current caller to the wait queue and return a promise that
   * resolves/rejects when the caller is either granted a token or timed out.
   */
  private _enqueue(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const waiter: (typeof this.waitQueue)[number] = {
        resolve,
        reject,
        enqueuedAt: Date.now(),
      };
      if (this.maxWaitMs !== undefined) {
        waiter.timeout = setTimeout(() => {
          const index = this.waitQueue.indexOf(waiter);
          if (index === -1) return;
          this.waitQueue.splice(index, 1);
          const waited = Date.now() - waiter.enqueuedAt;
          reject(
            new RateLimitError(
              `Rate limit: caller waited ${waited}ms, exceeding maxWaitMs of ${this.maxWaitMs}ms.`,
              waited,
            ),
          );
        }, this.maxWaitMs);
        if ((waiter.timeout as NodeJS.Timeout).unref)
          (waiter.timeout as NodeJS.Timeout).unref();
      }
      this.waitQueue.push(waiter);
    });
  }
}
