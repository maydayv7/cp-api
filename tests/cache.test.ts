import { beforeEach, describe, expect, it, vi } from "vitest";
import { cachedFetch, clearCache, getCacheSize } from "../src/cache";
import { configure, resetConfig } from "../src/config";

beforeEach(() => {
  resetConfig();
  clearCache();
});

describe("cache", () => {
  it("coalesces concurrent fetches and caches the result", async () => {
    const fetcher = vi.fn(async () => ({ ok: true }));
    const [first, second] = await Promise.all([
      cachedFetch("cf:test", fetcher),
      cachedFetch("cf:test", fetcher),
    ]);
    expect(first).toBe(second);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not cache failed fetches", async () => {
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce("ok");
    await expect(cachedFetch("cf:failure", fetcher)).rejects.toThrow("failed");
    await expect(cachedFetch("cf:failure", fetcher)).resolves.toBe("ok");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("applies configured capacity", async () => {
    configure({ cache: { maxSize: 2 } });
    await cachedFetch("cf:1", async () => 1);
    await cachedFetch("cf:2", async () => 2);
    await cachedFetch("cf:3", async () => 3);
    expect(getCacheSize()).toBe(2);
  });

  it("preserves entries and remaining TTL when resized upward", async () => {
    configure({ cache: { maxSize: 2 } });
    const first = vi.fn(async () => 1);
    const second = vi.fn(async () => 2);
    await cachedFetch("cf:1", first, 40);
    await cachedFetch("cf:2", second, 40);
    await new Promise((resolve) => setTimeout(resolve, 15));
    configure({ cache: { maxSize: 3 } });
    expect(getCacheSize()).toBe(2);
    await cachedFetch("cf:1", first, 40);
    await cachedFetch("cf:2", second, 40);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();

    await new Promise((resolve) => setTimeout(resolve, 30));
    await cachedFetch("cf:1", first, 40);
    expect(first).toHaveBeenCalledTimes(2);
  });

  it("preserves the most-recent entries when resized downward", async () => {
    configure({ cache: { maxSize: 2 } });
    const first = vi.fn(async () => 1);
    const second = vi.fn(async () => 2);
    await cachedFetch("cf:1", first);
    await cachedFetch("cf:2", second);
    await cachedFetch("cf:1", first); // make cf:1 most recent

    configure({ cache: { maxSize: 1 } });
    expect(getCacheSize()).toBe(1);
    await cachedFetch("cf:1", first);
    await cachedFetch("cf:2", second);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("keeps in-flight requests while resizing", async () => {
    let resolve!: (value: number) => void;
    const fetcher = vi.fn(
      () => new Promise<number>((done) => (resolve = done)),
    );
    const first = cachedFetch("cf:pending", fetcher);
    configure({ cache: { maxSize: 2 } });
    getCacheSize();
    const second = cachedFetch("cf:pending", fetcher);
    resolve(1);
    await expect(Promise.all([first, second])).resolves.toEqual([1, 1]);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
