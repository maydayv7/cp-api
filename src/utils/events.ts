/**
 * @file events.ts
 * @description Typed event emitter for the cp-api package.
 *
 * Provides a strongly-typed wrapper around Node.js EventEmitter so that all
 * internal subsystems (fetcher, cache, rate-limiter) can broadcast lifecycle
 * events in a consistent, type-safe way.
 *
 * Usage:
 * ```ts
 * import { onEvent, emitEvent } from './utils/events';
 *
 * onEvent('fetch:success', ({ platform, url, durationMs }) => {
 *   console.log(`[${platform}] ${url} responded in ${durationMs}ms`);
 * });
 *
 * emitEvent('fetch:start', { platform: 'twitter', url: 'https://api.twitter.com/...' });
 * ```
 */

import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Event Payload
// ---------------------------------------------------------------------------

/**
 * Shared payload shape for all cp-api events.
 *
 * All fields except `platform` are optional so that each event can carry only
 * the data that makes sense for its context.
 */
export interface CPEventPayload {
  /** The platform this event is associated with (e.g. `'twitter'`, `'reddit'`). */
  platform: string;

  /** The URL being fetched, if applicable. */
  url?: string;

  /** How long the operation took, in milliseconds, if applicable. */
  durationMs?: number;

  /** The error that occurred, for error events. */
  error?: Error;
}

// ---------------------------------------------------------------------------
// Event Map
// ---------------------------------------------------------------------------

/**
 * Mapping of every event name to its payload type.
 *
 * | Event            | When emitted                                         |
 * |------------------|------------------------------------------------------|
 * | `fetch:start`    | A network request is about to be dispatched.         |
 * | `fetch:success`  | A network request completed successfully.            |
 * | `fetch:error`    | A network request failed (after all retries).        |
 * | `cache:hit`      | A cached value was returned without a network call.  |
 * | `cache:miss`     | No cached value was found; a fetch will follow.      |
 * | `rateLimit:wait` | A caller is queued waiting for a rate-limit token.   |
 * | `rateLimit:hit`  | A rate-limit token was granted / consumed.           |
 */
export interface CPEventMap {
  'fetch:start': CPEventPayload;
  'fetch:success': CPEventPayload;
  'fetch:error': CPEventPayload;
  'cache:hit': CPEventPayload;
  'cache:miss': CPEventPayload;
  'rateLimit:wait': CPEventPayload;
  'rateLimit:hit': CPEventPayload;
}

/** Union of all valid cp-api event names. */
export type CPEventName = keyof CPEventMap;

// ---------------------------------------------------------------------------
// Typed listener type
// ---------------------------------------------------------------------------

/** A listener function for a specific event. */
export type CPEventListener<E extends CPEventName> = (payload: CPEventMap[E]) => void;

// ---------------------------------------------------------------------------
// Singleton EventEmitter
// ---------------------------------------------------------------------------

/**
 * The package-level singleton event emitter.
 *
 * All cp-api subsystems emit to this instance. Consumers can subscribe via
 * the {@link onEvent} helper or directly via `cpEvents.on(event, listener)`.
 *
 * @remarks
 * The default maximum listener count is raised to 50 to accommodate
 * applications with many concurrent subscribers without triggering Node.js
 * memory-leak warnings.
 */
export const cpEvents: EventEmitter = new EventEmitter();
cpEvents.setMaxListeners(50);

// ---------------------------------------------------------------------------
// Typed helper functions
// ---------------------------------------------------------------------------

/**
 * Subscribe to a cp-api event.
 *
 * @param event    - The event name (must be a key of {@link CPEventMap}).
 * @param listener - Callback invoked with the typed event payload.
 *
 * @example
 * ```ts
 * onEvent('fetch:error', ({ platform, error }) => {
 *   Sentry.captureException(error, { extra: { platform } });
 * });
 * ```
 */
export function onEvent<E extends CPEventName>(
  event: E,
  listener: CPEventListener<E>,
): void {
  // Node.js EventEmitter is untyped; the cast here is safe because we control
  // both the emitter (via emitEvent) and the listener signature.
  cpEvents.on(event, listener as (...args: unknown[]) => void);
}

/**
 * Unsubscribe a previously registered listener from a cp-api event.
 *
 * @param event    - The event name to unsubscribe from.
 * @param listener - The exact same function reference passed to {@link onEvent}.
 *
 * @example
 * ```ts
 * const handler = ({ platform }: CPEventPayload) => console.log(platform);
 * onEvent('cache:hit', handler);
 * // ... later ...
 * offEvent('cache:hit', handler);
 * ```
 */
export function offEvent<E extends CPEventName>(
  event: E,
  listener: CPEventListener<E>,
): void {
  cpEvents.off(event, listener as (...args: unknown[]) => void);
}

/**
 * Emit a cp-api event with a typed payload.
 *
 * @param event   - The event name to emit.
 * @param payload - The typed data to deliver to all registered listeners.
 *
 * @example
 * ```ts
 * emitEvent('fetch:start', { platform: 'reddit', url: requestUrl });
 * ```
 */
export function emitEvent<E extends CPEventName>(
  event: E,
  payload: CPEventMap[E],
): void {
  cpEvents.emit(event, payload);
}
