import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "../src/cache";
import { resetConfig, configure } from "../src/config";
import { AtCoder } from "../src/platforms/atcoder";
import { Codeforces } from "../src/platforms/codeforces";
import { HttpClient } from "../src/utils/httpClient";
import { resetPlatformHttpClients } from "../src/utils/platformHttpClient";

beforeEach(() => {
  clearCache();
  resetConfig();
  resetPlatformHttpClients();
  configure({ rateLimit: { enabled: false }, cache: { enabled: false } });
  vi.restoreAllMocks();
});

describe("Codeforces standings", () => {
  it("requests only contestId and filters and paginates rows locally", async () => {
    const rows = ["Alice", "Bob", "Carol"].map((handle, index) => ({
      party: { members: [{ handle }] },
      rank: index + 1,
      points: 0,
      penalty: 0,
      successfulHackCount: 0,
      unsuccessfulHackCount: 0,
      problemResults: [],
    }));
    const get = vi.spyOn(HttpClient.prototype, "get").mockResolvedValue({
      status: "OK",
      result: { contest: { id: 1 }, problems: [], rows },
    });
    const result = await new Codeforces().getContestStandings(1, {
      handles: ["bob", "CAROL"],
      from: 2,
      count: 1,
    });
    expect(get).toHaveBeenCalledWith(
      "https://codeforces.com/api/contest.standings?contestId=1",
    );
    expect(result.rows[0].party.members[0].handle).toBe("Carol");
  });
});

describe("AtCoder submissions", () => {
  it("paginates, deduplicates, and filters submissions", async () => {
    const first = Array.from({ length: 500 }, (_, index) => ({
      id: index + 1,
      epoch_second: 100 + index,
      problem_id: "abc_a",
      contest_id: "abc",
      user_id: "tourist",
      language: "C++",
      point: 0,
      length: 0,
      result: index % 2 ? "WA" : "AC",
      execution_time: null,
    }));
    const get = vi
      .spyOn(HttpClient.prototype, "get")
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce([
        first[499],
        { ...first[0], id: 501, epoch_second: 600 },
      ]);
    const result = await new AtCoder().getUserSubmissions("Tourist", {
      fromSecond: 100,
      verdict: "AC",
    });
    expect(get).toHaveBeenNthCalledWith(
      2,
      "https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions",
      { user: "tourist", from_second: 600 },
    );
    expect(new Set(result.map((submission) => submission.id)).size).toBe(
      result.length,
    );
    expect(result.every((submission) => submission.result === "AC")).toBe(true);
  });
});
