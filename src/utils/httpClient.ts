/**
 * @file httpClient.ts
 * @description A smart HTTP client wrapping axios for CP-API
 *
 * Features:
 *  - Configurable timeout, retry count, and retry delay.
 *  - Exponential backoff with jitter on retryable errors (429, 503, network).
 *  - Optional {@link RateLimiter} integration - calls `acquire()` before each request.
 *  - Custom User-Agent and optional proxy support.
 *  - Full TypeScript generics so callers get typed response bodies.
 */

import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosError,
  AxiosProxyConfig,
} from "axios";
import { RateLimiter } from "./rateLimiter";
import { emitEvent } from "./events";
import { log } from "./logger";

// TYPES

/** Configuration passed to the {@link HttpClient} constructor */
export interface HttpClientConfig {
  /**
   * Request timeout in milliseconds
   * @default 30_000
   */
  timeout?: number;

  /**
   * Maximum number of retry attempts for retryable errors
   * @default 3
   */
  maxRetries?: number;

  /**
   * Base delay in milliseconds before the first retry
   * Subsequent retries use exponential backoff + random jitter
   * @default 500
   */
  retryDelay?: number;

  /**
   * Value to send in the `User-Agent` header
   * @default 'cp-api/1.0'
   */
  userAgent?: string;

  /**
   * Optional axios-compatible proxy configuration
   * @example { host: '127.0.0.1', port: 8080 }
   */
  proxy?: AxiosProxyConfig;

  /**
   * Optional rate limiter to throttle outbound requests
   * When provided, `acquire()` is called before every request attempt
   */
  rateLimiter?: RateLimiter;
  /** Platform name used in events and logs */
  platform?: string;
}

/** HTTP status codes that trigger an automatic retry */
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

// HELPERS

/**
 * Calculate the delay (ms) for the nth retry attempt
 * Using exponential backoff plus a random jitter of 0–500 ms.
 *
 * Formula: `baseDelay * 2^attempt + random(0, 500)`
 */
function computeBackoff(baseDelay: number, attempt: number): number {
  const exponential = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 500;
  return Math.floor(exponential + jitter);
}

/** Returns true if the AxiosError should be retried */
function isRetryable(error: AxiosError): boolean {
  // Network-level errors (no response received).
  if (!error.response) {
    return true;
  }
  return RETRYABLE_STATUS_CODES.has(error.response.status);
}

/** Pause execution for `ms` milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(error: AxiosError): number | undefined {
  const value = error.response?.headers?.["retry-after"];
  if (typeof value === "number") return Math.max(0, value * 1000);
  if (typeof value !== "string") return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

// HttpClient

/**
 * Smart HTTP client with automatic retry, backoff, and optional rate-limiting
 *
 * @example
 * ```ts
 * const client = new HttpClient({ timeout: 10_000, maxRetries: 3 });
 *
 * interface Post { id: number; title: string; }
 * const post = await client.get<Post>('https://jsonplaceholder.typicode.com/posts/1');
 * console.log(post.title);
 * ```
 */
export class HttpClient {
  private readonly axiosInstance: AxiosInstance;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly rateLimiter: RateLimiter | undefined;
  private readonly platform: string;

  constructor(config: HttpClientConfig = {}) {
    const {
      timeout = 30_000,
      maxRetries = 3,
      retryDelay = 500,
      userAgent = "cp-api/1.0",
      proxy,
      rateLimiter,
      platform = "unknown",
    } = config;

    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
    this.rateLimiter = rateLimiter;
    this.platform = platform;

    // Build a shared axios instance with sensible defaults
    this.axiosInstance = axios.create({
      timeout,
      proxy: proxy ?? undefined,
      headers: {
        "User-Agent": userAgent,
        Accept: "application/json",
      },
    });
  }

  // Public Methods

  /**
   * Perform a GET request and return the typed response body
   *
   * @param url     - Absolute URL to fetch.
   * @param params  - Optional query-string parameters (serialised by axios).
   * @param headers - Optional extra request headers.
   * @returns The deserialised response body typed as `T`.
   *
   * @example
   * ```ts
   * const data = await client.get<User[]>('/users', { page: 1 });
   * ```
   */
  public async get<T>(
    url: string,
    params?: Record<string, unknown>,
    headers?: Record<string, string>,
    options: Omit<
      AxiosRequestConfig,
      "method" | "url" | "params" | "headers"
    > = {},
  ): Promise<T> {
    return this._request<T>({
      ...options,
      method: "GET",
      url,
      params,
      headers,
    });
  }

  /** Perform a GET when only Axios request options are needed */
  public async getWithOptions<T>(
    url: string,
    options: Omit<AxiosRequestConfig, "method" | "url" | "params" | "headers">,
  ): Promise<T> {
    return this._request<T>({ ...options, method: "GET", url });
  }

  /**
   * Perform a POST request and return the typed response body
   *
   * @param url     - Absolute URL to post to.
   * @param data    - Request body (will be JSON-serialised by axios).
   * @param headers - Optional extra request headers.
   * @returns The deserialised response body typed as `T`.
   *
   * @example
   * ```ts
   * const created = await client.post<Post>('/posts', { title: 'Hello' });
   * ```
   */
  public async post<T>(
    url: string,
    data: unknown,
    headers?: Record<string, string>,
    options: Omit<
      AxiosRequestConfig,
      "method" | "url" | "data" | "headers"
    > = {},
  ): Promise<T> {
    return this._request<T>({ ...options, method: "POST", url, data, headers });
  }

  // Private request logic

  /**
   * Internal request dispatcher with retry + backoff logic
   *
   * @param config - Axios-compatible request config.
   */
  private async _request<T>(config: AxiosRequestConfig): Promise<T> {
    let attempt = 0;
    const startedAt = Date.now();
    const url = String(config.url ?? "");
    emitEvent("fetch:start", { platform: this.platform, url, attempt: 0 });

    while (true) {
      // Acquire a rate-limiter token before every attempt (including retries)
      if (this.rateLimiter) {
        await this.rateLimiter.acquire();
      }

      try {
        const response = await this.axiosInstance.request<T>(config);
        emitEvent("fetch:success", {
          platform: this.platform,
          url,
          attempt,
          durationMs: Date.now() - startedAt,
        });
        return response.data;
      } catch (err) {
        const axiosErr = err as AxiosError;

        // Non-retryable errors - bubble up immediately
        if (!axios.isAxiosError(axiosErr) || !isRetryable(axiosErr)) {
          const error =
            axiosErr instanceof Error ? axiosErr : new Error(String(err));
          emitEvent("fetch:error", {
            platform: this.platform,
            url,
            attempt,
            durationMs: Date.now() - startedAt,
            error,
          });
          throw axiosErr;
        }

        // We've exhausted our retry budget
        if (attempt >= this.maxRetries) {
          emitEvent("fetch:error", {
            platform: this.platform,
            url,
            attempt,
            durationMs: Date.now() - startedAt,
            error: axiosErr,
          });
          throw axiosErr;
        }

        const delay =
          retryAfterMs(axiosErr) ?? computeBackoff(this.retryDelay, attempt);
        const status = axiosErr.response?.status ?? "network error";
        log("warn", "Retrying platform request", {
          platform: this.platform,
          method: config.method,
          status,
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          delayMs: delay,
        });
        emitEvent("fetch:retry", {
          platform: this.platform,
          url,
          attempt: attempt + 1,
          delayMs: delay,
          error: axiosErr,
        });

        await sleep(delay);
        attempt++;
      }
    }
  }
}
