import { LRUCache } from "lru-cache";
import { getConfig } from "./config";
import { emitEvent } from "./utils/events";

let configuredMax = 500;
let cache = new LRUCache<string, any>({ max: configuredMax });
const pending = new Map<string, Promise<any>>();

function platformFromKey(key: string): string {
  const prefix = key.split(":", 1)[0];
  return (
    { cf: "codeforces", ac: "atcoder", cc: "codechef", lc: "leetcode" }[
      prefix
    ] ?? "unknown"
  );
}

function syncCapacity(): void {
  const max = getConfig().cache.maxSize ?? 500;
  if (max === configuredMax) return;
  const entries = cache.dump();
  configuredMax = max;
  cache = new LRUCache<string, any>({ max });
  cache.load(entries);
}

export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs?: number,
): Promise<T> {
  const config = getConfig();
  syncCapacity();

  if (!config.cache.enabled) return fetcher();
  if (cache.has(key)) {
    emitEvent("cache:hit", { platform: platformFromKey(key), key });
    return cache.get(key) as T;
  }

  emitEvent("cache:miss", { platform: platformFromKey(key), key });
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;

  const request = fetcher()
    .then((value) => {
      const ttl = ttlMs ?? getConfig().cache.ttlMs;
      cache.set(key, value, { ttl });
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export function clearCache(): void {
  cache.clear();
  pending.clear();
}

export function invalidate(key: string): void {
  cache.delete(key);
}

export function getCacheSize(): number {
  syncCapacity();
  return cache.size;
}
