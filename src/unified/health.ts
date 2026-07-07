import axios from 'axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The set of platforms that the Health checker understands. */
export type HealthPlatform = 'CODEFORCES' | 'ATCODER' | 'CODECHEF' | 'LEETCODE';

/**
 * The result of a single platform connectivity check.
 */
export type HealthResult = {
  /** Canonical platform identifier. */
  platform: HealthPlatform;
  /** `true` when the platform responded within the timeout with a valid HTTP status. */
  reachable: boolean;
  /** Round-trip time in milliseconds, measured from request start to response receipt. */
  latencyMs: number;
  /** UTC timestamp of when this check was performed. */
  timestamp: Date;
  /** Human-readable error message when `reachable` is `false`. */
  error?: string;
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Maximum time (ms) to wait for any single platform health check. */
const HEALTH_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// Per-platform check implementations
// ---------------------------------------------------------------------------

/**
 * Check Codeforces connectivity.
 *
 * Endpoint: `GET /api/contest.list?gym=false`
 * Success criterion: HTTP 2xx **and** `response.data.status === "OK"`.
 */
async function checkCodeforces(): Promise<HealthResult> {
  const timestamp = new Date();
  const start = Date.now();

  try {
    const response = await axios.get('https://codeforces.com/api/contest.list?gym=false', {
      timeout: HEALTH_TIMEOUT_MS,
      // Avoid returning a cached 304; we want a live round-trip.
      headers: { 'Cache-Control': 'no-cache' },
    });

    const latencyMs = Date.now() - start;

    if (response.data?.status !== 'OK') {
      return {
        platform: 'CODEFORCES',
        reachable: false,
        latencyMs,
        timestamp,
        error: `Unexpected API status: ${response.data?.status ?? 'unknown'}`,
      };
    }

    return { platform: 'CODEFORCES', reachable: true, latencyMs, timestamp };
  } catch (err: any) {
    return {
      platform: 'CODEFORCES',
      reachable: false,
      latencyMs: Date.now() - start,
      timestamp,
      error: _errorMessage(err),
    };
  }
}

/**
 * Check AtCoder (via Kenkoooo API) connectivity.
 *
 * Endpoint: `GET /resources/problems.json`
 * Uses `Range: bytes=0-10` so we only download a tiny slice — the server
 * responding with 206 Partial Content confirms reachability without pulling
 * tens of MB of problem data.
 */
async function checkAtCoder(): Promise<HealthResult> {
  const timestamp = new Date();
  const start = Date.now();

  try {
    await axios.get('https://kenkoooo.com/atcoder/resources/problems.json', {
      timeout: HEALTH_TIMEOUT_MS,
      headers: { Range: 'bytes=0-10' },
      // axios will throw on non-2xx by default; 206 is fine.
      validateStatus: (status) => status >= 200 && status < 300,
    });

    return {
      platform: 'ATCODER',
      reachable: true,
      latencyMs: Date.now() - start,
      timestamp,
    };
  } catch (err: any) {
    return {
      platform: 'ATCODER',
      reachable: false,
      latencyMs: Date.now() - start,
      timestamp,
      error: _errorMessage(err),
    };
  }
}

/**
 * Check CodeChef connectivity.
 *
 * Endpoint: `GET /api/list/contests/all`
 * Success criterion: HTTP 2xx with a JSON body (we just check the response
 * arrives — no deep inspection required for a liveness probe).
 */
async function checkCodeChef(): Promise<HealthResult> {
  const timestamp = new Date();
  const start = Date.now();

  try {
    const response = await axios.get('https://www.codechef.com/api/list/contests/all', {
      timeout: HEALTH_TIMEOUT_MS,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json',
      },
    });

    const latencyMs = Date.now() - start;

    // CodeChef returns { status: 'success', … } on success.
    if (response.data?.status && response.data.status !== 'success') {
      return {
        platform: 'CODECHEF',
        reachable: false,
        latencyMs,
        timestamp,
        error: `Unexpected status field: ${response.data.status}`,
      };
    }

    return { platform: 'CODECHEF', reachable: true, latencyMs, timestamp };
  } catch (err: any) {
    return {
      platform: 'CODECHEF',
      reachable: false,
      latencyMs: Date.now() - start,
      timestamp,
      error: _errorMessage(err),
    };
  }
}

/**
 * Check LeetCode GraphQL endpoint connectivity.
 *
 * Endpoint: `POST /graphql` with an introspection mini-query `{ __typename }`.
 * This is the lightest possible valid GraphQL request and confirms the API
 * gateway is alive without touching any user data.
 */
async function checkLeetCode(): Promise<HealthResult> {
  const timestamp = new Date();
  const start = Date.now();

  try {
    const response = await axios.post(
      'https://leetcode.com/graphql',
      { query: '{ __typename }' },
      {
        timeout: HEALTH_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
      },
    );

    const latencyMs = Date.now() - start;

    // A valid GraphQL response always has a `data` key.
    if (!response.data || typeof response.data.data === 'undefined') {
      return {
        platform: 'LEETCODE',
        reachable: false,
        latencyMs,
        timestamp,
        error: 'Response missing GraphQL `data` field',
      };
    }

    return { platform: 'LEETCODE', reachable: true, latencyMs, timestamp };
  } catch (err: any) {
    return {
      platform: 'LEETCODE',
      reachable: false,
      latencyMs: Date.now() - start,
      timestamp,
      error: _errorMessage(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Dispatch table
// ---------------------------------------------------------------------------

const CHECKERS: Record<HealthPlatform, () => Promise<HealthResult>> = {
  CODEFORCES: checkCodeforces,
  ATCODER: checkAtCoder,
  CODECHEF: checkCodeChef,
  LEETCODE: checkLeetCode,
};

/** Ordered list used when no specific platform is requested. */
const ALL_PLATFORMS: HealthPlatform[] = ['CODEFORCES', 'ATCODER', 'CODECHEF', 'LEETCODE'];

// ---------------------------------------------------------------------------
// Health class
// ---------------------------------------------------------------------------

/**
 * **Health** — lightweight connectivity probes for all supported CP platforms.
 *
 * Every check fires a minimal real HTTP request, measures the round-trip
 * latency, and returns a structured {@link HealthResult}. All checks run in
 * parallel via `Promise.all`; errors are caught internally so one failing
 * platform never masks the results of the others.
 *
 * @example
 * ```ts
 * import { Health } from '@ronit/cp-api/unified/health';
 *
 * const health = new Health();
 *
 * // Check a single platform:
 * const [result] = await health.check('CODEFORCES');
 * console.log(result.reachable, result.latencyMs);
 *
 * // Check all platforms at once:
 * const results = await health.check();
 * results.forEach(r => console.log(r.platform, r.reachable ? '✓' : '✗'));
 * ```
 */
export class Health {
  /**
   * Run connectivity checks for the specified platform, or for **all four**
   * platforms when called with no argument.
   *
   * Checks are executed in parallel with a per-check timeout of
   * {@link HEALTH_TIMEOUT_MS} ms (8 s). A check that times out or throws an
   * error still returns a {@link HealthResult} with `reachable: false` and an
   * `error` description — it never rejects the returned Promise.
   *
   * @param platform Optional. One of `'CODEFORCES'`, `'ATCODER'`,
   *                 `'CODECHEF'`, or `'LEETCODE'`. Omit to check all.
   * @returns        Array of {@link HealthResult} objects, one per checked platform.
   *
   * @example
   * ```ts
   * // Single platform
   * const [cf] = await health.check('CODEFORCES');
   *
   * // All platforms
   * const all = await health.check();
   * const down = all.filter(r => !r.reachable);
   * ```
   */
  async check(platform?: HealthPlatform): Promise<HealthResult[]> {
    const targets: HealthPlatform[] = platform ? [platform] : ALL_PLATFORMS;

    // Run all checks concurrently. Each checker catches its own errors, so
    // Promise.all (not allSettled) is safe and gives us proper typing.
    return Promise.all(targets.map((p) => CHECKERS[p]()));
  }
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

/**
 * Extract a concise human-readable message from an unknown thrown value.
 * Prefers `err.message`; for Axios errors also appends the HTTP status.
 */
function _errorMessage(err: any): string {
  if (!err) return 'Unknown error';

  // Axios error with an HTTP response.
  if (err.response) {
    return `HTTP ${err.response.status}: ${err.message}`;
  }

  // Network-level error (ECONNREFUSED, ETIMEDOUT, etc.).
  if (err.code) {
    return `${err.code}: ${err.message}`;
  }

  return err.message ?? String(err);
}
