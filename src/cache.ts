import { LRUCache } from 'lru-cache';
import { getConfig } from './config';

const _cache = new LRUCache<string, { value: any; expiresAt: number }>({
  max: 500,
});

/**
 * Fetch with optional LRU cache.
 * @param key        Unique cache key
 * @param fetcher    Async function that fetches the data
 * @param ttlMs      Override TTL in milliseconds (uses global config default if omitted)
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs?: number
): Promise<T> {
  const config = getConfig();

  if (config.cache.enabled) {
    const entry = _cache.get(key);
    if (entry && Date.now() < entry.expiresAt) {
      return entry.value as T;
    }
  }

  const value = await fetcher();

  if (config.cache.enabled) {
    const ttl = ttlMs ?? config.cache.ttlMs;
    _cache.set(key, { value, expiresAt: Date.now() + ttl }, { ttl });
  }

  return value;
}

/** Clear the entire cache */
export function clearCache(): void {
  _cache.clear();
}

/** Clear a specific cache key */
export function invalidate(key: string): void {
  _cache.delete(key);
}

/** Get current cache size */
export function getCacheSize(): number {
  return _cache.size;
}
