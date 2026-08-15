/**
 * Codeforces API wrapper
 * Official docs: https://codeforces.com/apiHelp
 */
import * as cheerio from "cheerio";
import { cachedFetch } from "../cache";
import { UnifiedContest } from "../types";
import {
  assertProblemPageAccessible,
  ProblemContent,
  ProblemContentFetcher,
  sanitizeProblemHtml,
} from "../problemContent";
import { getPlatformHttpClient } from "../utils/platformHttpClient";
import { Health } from "../unified/health";

const CF_API_BASE = "https://codeforces.com/api";
const CF_MAIN = "https://codeforces.com";

// TYPES

export interface CFUserInfo {
  handle: string;
  email?: string;
  vkId?: string;
  openId?: string;
  firstName?: string;
  lastName?: string;
  country?: string;
  city?: string;
  organization?: string;
  contribution?: number;
  rank?: string;
  rating?: number;
  maxRank?: string;
  maxRating?: number;
  lastOnlineTimeSeconds?: number;
  registrationTimeSeconds?: number;
  friendOfCount?: number;
  avatar?: string;
  titlePhoto?: string;
}

export interface CFSubmission {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  relativeTimeSeconds?: number;
  problem: {
    contestId?: number;
    index: string;
    name: string;
    type?: string;
    rating?: number;
    tags?: string[];
  };
  author?: { members: Array<{ handle: string }> };
  programmingLanguage?: string;
  verdict: string;
  testset?: string;
  passedTestCount?: number;
  timeConsumedMillis?: number;
  memoryConsumedBytes?: number;
  points?: number;
}

export interface CFProblem {
  contestId: number;
  problemsetName?: string;
  index: string;
  name: string;
  type?: string;
  rating?: number;
  tags?: string[];
}

export interface CFContest {
  id: number;
  name: string;
  type: string;
  phase: string;
  frozen: boolean;
  durationSeconds: number;
  startTimeSeconds?: number;
  relativeTimeSeconds?: number;
  preparedBy?: string;
  websiteUrl?: string;
  description?: string;
  difficulty?: number;
  kind?: string;
  icpcRegion?: string;
  country?: string;
  city?: string;
  season?: string;
}

export interface CFRatingChange {
  contestId: number;
  contestName: string;
  handle: string;
  rank: number;
  ratingUpdateTimeSeconds: number;
  oldRating: number;
  newRating: number;
}

export interface CFHackResult {
  id: number;
  creationTimeSeconds: number;
  hacker: { members: Array<{ handle: string }> };
  defender: { members: Array<{ handle: string }> };
  verdict?: string;
  problem: { index: string; name: string };
  judgeProtocol?: { manual: boolean; protocol: string; verdict: string };
}

export interface CFBlogEntry {
  id: number;
  originalLocale: string;
  creationTimeSeconds: number;
  authorHandle: string;
  title: string;
  content?: string;
  locale: string;
  modificationTimeSeconds: number;
  allowViewHistory: boolean;
  tags: string[];
  rating: number;
}

export interface CFStandings {
  contest: CFContest;
  problems: CFProblem[];
  rows: Array<{
    party: { members: Array<{ handle: string }>; teamName?: string };
    rank: number;
    points: number;
    penalty: number;
    successfulHackCount: number;
    unsuccessfulHackCount: number;
    problemResults: Array<{
      points: number;
      penalty?: number;
      rejectedAttemptCount: number;
      type: string;
      bestSubmissionTimeSeconds?: number;
    }>;
  }>;
}

export interface CFProblemFilters {
  tags?: string[];
  minRating?: number;
  maxRating?: number;
}

export interface CFSubmissionFilters {
  verdict?:
    | "OK"
    | "WRONG_ANSWER"
    | "TIME_LIMIT_EXCEEDED"
    | "RUNTIME_ERROR"
    | "COMPILATION_ERROR"
    | string;
  from?: number;
  count?: number;
}

export interface CFProblemContentOptions {
  /** Override how the public problem page HTML is fetched */
  fetcher?: ProblemContentFetcher;
}

function cleanPre(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<any>,
): string {
  const lines = element.children(".test-example-line");
  if (lines.length) {
    return lines
      .map((_, line) => $(line).text())
      .get()
      .join("\n");
  }

  const clone = element.clone();
  clone.find("br").replaceWith("\n");
  return clone.text().replace(/\r/g, "").replace(/\n$/, "");
}

function sectionHtml($: cheerio.CheerioAPI, selector: string): string {
  const section = $(selector).first().clone();
  section.find(".section-title").first().remove();
  return section.html()?.trim() ?? "";
}

function parseDurationMs(value: string): number | undefined {
  const match = value.match(/([\d.]+)\s*(second|millisecond)/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  return match[2].toLowerCase().startsWith("milli") ? amount : amount * 1000;
}

function parseMemoryMb(value: string): number | undefined {
  const match = value.match(/([\d.]+)\s*(megabyte|mb|kilobyte|kb)/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  return match[2].toLowerCase().startsWith("k") ? amount / 1024 : amount;
}

/** Parse a Codeforces problem page into normalized public problem content */
export function parseCodeforcesProblemContent(
  html: string,
  contestId: number,
  index: string,
  sourceUrl: string,
): ProblemContent {
  assertProblemPageAccessible(html, "CODEFORCES");
  const $ = cheerio.load(html);
  const root = $(".problem-statement").first();
  if (!root.length)
    throw new Error("Codeforces problem statement was not found");
  const statement = root
    .children("div")
    .not(
      ".header, .input-specification, .output-specification, .sample-tests, .note",
    )
    .first();
  const samples = root
    .find(".sample-test")
    .map((_, sample) => ({
      input: cleanPre($, $(sample).find(".input pre").first()),
      output: cleanPre($, $(sample).find(".output pre").first()),
    }))
    .get();
  return {
    platform: "CODEFORCES",
    contestId: String(contestId),
    problemId: index.toUpperCase(),
    title: root.find(".header .title").first().text().trim(),
    statementHtml: sanitizeProblemHtml(
      statement.html()?.trim() ?? "",
      sourceUrl,
    ),
    inputSpecificationHtml: sanitizeProblemHtml(
      sectionHtml($, ".problem-statement .input-specification"),
      sourceUrl,
    ),
    outputSpecificationHtml: sanitizeProblemHtml(
      sectionHtml($, ".problem-statement .output-specification"),
      sourceUrl,
    ),
    notesHtml:
      sanitizeProblemHtml(
        sectionHtml($, ".problem-statement .note"),
        sourceUrl,
      ) || undefined,
    samples,
    timeLimitMs: parseDurationMs(root.find(".time-limit").first().text()),
    memoryLimitMb: parseMemoryMb(root.find(".memory-limit").first().text()),
    sourceUrl,
  };
}

// UTILITIES

/** Rating-to-rank mapping */
export function getCFRankFromRating(rating: number): string {
  if (rating < 1200) return "Newbie";
  if (rating < 1400) return "Pupil";
  if (rating < 1600) return "Specialist";
  if (rating < 1900) return "Expert";
  if (rating < 2100) return "Candidate Master";
  if (rating < 2300) return "Master";
  if (rating < 2400) return "International Master";
  if (rating < 2600) return "Grandmaster";
  if (rating < 3000) return "International Grandmaster";
  return "Legendary Grandmaster";
}

/** Rating-to-hex-color mapping */
export function getCFRatingColor(rating: number): string {
  if (rating < 1200) return "#808080"; // Gray
  if (rating < 1400) return "#008000"; // Green
  if (rating < 1600) return "#03a89e"; // Cyan
  if (rating < 1900) return "#0000ff"; // Blue
  if (rating < 2100) return "#aa00aa"; // Violet
  if (rating < 2300) return "#ff8c00"; // Orange
  if (rating < 2400) return "#ff8c00"; // Orange
  if (rating < 2600) return "#ff0000"; // Red
  if (rating < 3000) return "#ff0000"; // Red
  return "#aa0000"; // Dark Red
}

// HELPERS

async function cfGet<T>(
  endpoint: string,
  params: Record<string, any> = {},
): Promise<T> {
  const qs = new URLSearchParams(params as any).toString();
  const url = `${CF_API_BASE}/${endpoint}${qs ? "?" + qs : ""}`;
  const response = await getPlatformHttpClient("codeforces").get<{
    status: string;
    comment?: string;
    result: T;
  }>(url);
  if (response.status !== "OK") {
    throw new Error(
      `Codeforces API error: ${response.comment || "Unknown error"}`,
    );
  }
  return response.result;
}

// Codeforces CLASS

export class Codeforces {
  // User Methods

  /**
   * Fetch user info for one or multiple handles
   * @example const [tourist] = await cp.codeforces.getUser('tourist')
   * @example const [a, b] = await cp.codeforces.getUser(['tourist', 'jiangly'])
   */
  async getUser(handles: string | string[]): Promise<CFUserInfo[]> {
    const handlesParam = Array.isArray(handles) ? handles.join(";") : handles;
    return cachedFetch(`cf:user:${handlesParam}`, () =>
      cfGet<CFUserInfo[]>("user.info", { handles: handlesParam }),
    );
  }

  /**
   * Fetch the full rating history (all rated contests) for a user
   * Useful for drawing rating graphs.
   */
  async getUserRatingHistory(handle: string): Promise<CFRatingChange[]> {
    return cachedFetch(`cf:user:rating:${handle}`, () =>
      cfGet<CFRatingChange[]>("user.rating", { handle }),
    );
  }

  /**
   * Fetch recent submissions for a user, optionally filtered
   * @param handle   CF handle
   * @param filters  { verdict?, from?, count? }
   */
  async getSubmissions(
    handle: string,
    filters: CFSubmissionFilters = {},
  ): Promise<CFSubmission[]> {
    const { from = 1, count = 100, verdict } = filters;
    const result = await cfGet<CFSubmission[]>("user.status", {
      handle,
      from,
      count,
    });
    if (verdict) return result.filter((s) => s.verdict === verdict);
    return result;
  }

  /**
   * Fetch ALL submissions for a user newer than a Unix epoch (ms) with pagination
   */
  async getSubmissionsSince(
    handle: string,
    sinceMs: number,
  ): Promise<CFSubmission[]> {
    const sinceSeconds = Math.floor(sinceMs / 1000);
    const collected: CFSubmission[] = [];
    const PAGE_SIZE = 1000;
    let from = 1;
    for (let page = 0; page < 20; page++) {
      const batch = await cfGet<CFSubmission[]>("user.status", {
        handle,
        from,
        count: PAGE_SIZE,
      });
      if (!batch.length) break;
      collected.push(...batch);
      const oldest = batch[batch.length - 1];
      if (oldest.creationTimeSeconds < sinceSeconds) break;
      if (batch.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return collected;
  }

  /**
   * Returns the set of unique problems solved by a user (verdict === "OK"),
   * optionally filtered by rating range and tags.
   */
  async getUserSolvedProblems(
    handle: string,
    filters: CFProblemFilters = {},
  ): Promise<CFProblem[]> {
    const submissions = await this.getSubmissions(handle, { count: 10000 });
    const solvedKeys = new Set<string>();
    const solved: CFProblem[] = [];

    for (const s of submissions) {
      if (s.verdict !== "OK") continue;
      const key = `${s.problem.contestId ?? ""}-${s.problem.index}`;
      if (solvedKeys.has(key)) continue;
      solvedKeys.add(key);

      const rating = s.problem.rating ?? 0;
      if (filters.minRating && rating < filters.minRating) continue;
      if (filters.maxRating && rating > filters.maxRating) continue;
      if (filters.tags?.length) {
        const hasTags = filters.tags.every((tag) =>
          s.problem.tags?.includes(tag),
        );
        if (!hasTags) continue;
      }
      solved.push(s.problem as unknown as CFProblem);
    }
    return solved;
  }

  /**
   * Returns count of solved/attempted problems, broken down by verdict
   */
  async getSolvedCount(handle: string): Promise<Record<string, number>> {
    const submissions = await this.getSubmissions(handle, { count: 10000 });
    const counts: Record<string, number> = {};
    for (const s of submissions) {
      counts[s.verdict] = (counts[s.verdict] ?? 0) + 1;
    }
    return counts;
  }

  /**
   * Returns the current and longest submission streaks (in days) for a user
   */
  async getUserStreak(
    handle: string,
  ): Promise<{ current: number; longest: number }> {
    const submissions = await this.getSubmissions(handle, { count: 10000 });
    if (!submissions.length) return { current: 0, longest: 0 };

    const days = new Set(
      submissions.map((s) => {
        const d = new Date(s.creationTimeSeconds * 1000);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      }),
    );
    const sorted = Array.from(days).sort().reverse();
    let longest = 0,
      streak = 0;

    const todayKey = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })();
    let prev: Date | null = null;

    for (const dayStr of sorted) {
      const [y, m, dd] = dayStr.split("-").map(Number);
      const date = new Date(y, m, dd);
      if (!prev) {
        streak = 1;
        prev = date;
        continue;
      }
      const diff = Math.round((prev.getTime() - date.getTime()) / 86400000);
      if (diff === 1) {
        streak++;
      } else {
        streak = 1;
      }
      if (streak > longest) longest = streak;
      prev = date;
    }
    if (streak > longest) longest = streak;

    // Current streak: starts from today or yesterday
    let current = 1;
    for (let i = 1; i < sorted.length; i++) {
      const [y1, m1, d1] = sorted[i - 1].split("-").map(Number);
      const [y2, m2, d2] = sorted[i].split("-").map(Number);
      const prev2 = new Date(y1, m1, d1),
        curr2 = new Date(y2, m2, d2);
      const diff = Math.round((prev2.getTime() - curr2.getTime()) / 86400000);
      if (diff === 1) current++;
      else {
        break;
      }
    }
    if (!days.has(todayKey)) {
      const yesterdayKey = (() => {
        const d = new Date(Date.now() - 86400000);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })();
      if (!days.has(yesterdayKey)) current = 0;
    }
    return { current, longest };
  }

  /**
   * Returns a daily activity heatmap as Record<YYYY-MM-DD, submissionCount>
   */
  async getUserActivityHeatmap(
    handle: string,
  ): Promise<Record<string, number>> {
    const submissions = await this.getSubmissions(handle, { count: 10000 });
    const heatmap: Record<string, number> = {};
    for (const s of submissions) {
      const d = new Date(s.creationTimeSeconds * 1000);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      heatmap[key] = (heatmap[key] ?? 0) + 1;
    }
    return heatmap;
  }

  // Problem Methods

  /**
   * Fetch the full Codeforces problemset, optionally filtered by tags/rating
   * Result is cached for 1 hour.
   */
  async getProblems(filters: CFProblemFilters = {}): Promise<CFProblem[]> {
    const result = await cachedFetch(
      "cf:problems",
      () =>
        cfGet<{ problems: CFProblem[]; problemStatistics: any[] }>(
          "problemset.problems",
          {},
        ).then((r) => r.problems),
      3600_000, // 1h
    );
    let filtered = result;
    if (filters.tags?.length)
      filtered = filtered.filter((p) =>
        filters.tags!.every((tag) => p.tags?.includes(tag)),
      );
    if (filters.minRating)
      filtered = filtered.filter((p) => (p.rating ?? 0) >= filters.minRating!);
    if (filters.maxRating)
      filtered = filtered.filter((p) => (p.rating ?? 0) <= filters.maxRating!);
    return filtered;
  }

  /**
   * Get a single problem by contestId and index (Eg. 1234, 'A')
   */
  async getProblem(
    contestId: number,
    index: string,
  ): Promise<CFProblem | null> {
    const problems = await this.getProblems();
    return (
      problems.find(
        (p) =>
          p.contestId === contestId &&
          p.index.toLowerCase() === index.toLowerCase(),
      ) ?? null
    );
  }

  /**
   * Fetch and parse the public statement and sample tests
   * A custom fetcher can provide HTML when the platform blocks direct requests.
   */
  async getProblemContent(
    contestId: number,
    index: string,
    options: CFProblemContentOptions = {},
  ): Promise<ProblemContent> {
    const normalizedIndex = index.toUpperCase();
    const sourceUrl = `${CF_MAIN}/contest/${contestId}/problem/${encodeURIComponent(normalizedIndex)}?locale=en`;
    return cachedFetch(
      `cf:problem-content:${options.fetcher ? "custom" : "direct"}:${contestId}:${normalizedIndex}`,
      async () => {
        const html = options.fetcher
          ? await options.fetcher(sourceUrl)
          : await getPlatformHttpClient("codeforces").getWithOptions<string>(
              sourceUrl,
              { responseType: "text" },
            );
        if (typeof html !== "string")
          throw new TypeError("Problem content fetcher must return HTML");
        return parseCodeforcesProblemContent(
          html,
          contestId,
          normalizedIndex,
          sourceUrl,
        );
      },
      3_600_000,
    );
  }

  /**
   * Returns a random problem matching the given filters
   */
  async getRandomProblem(
    filters: CFProblemFilters = {},
  ): Promise<CFProblem | null> {
    const problems = await this.getProblems(filters);
    if (!problems.length) return null;
    return problems[Math.floor(Math.random() * problems.length)];
  }

  /**
   * Check if a user has solved a specific problem
   */
  async isProblemSolved(
    handle: string,
    contestId: number,
    index: string,
  ): Promise<boolean> {
    const submissions = await this.getSubmissions(handle, { count: 10000 });
    return submissions.some(
      (s) =>
        s.verdict === "OK" &&
        s.problem.contestId === contestId &&
        s.problem.index.toLowerCase() === index.toLowerCase(),
    );
  }

  // Contest Methods

  /**
   * Fetch the full contest list
   * By default returns only upcoming contests.
   * @param opts.phase  'BEFORE' | 'CODING' | 'PENDING_SYSTEM_TEST' | 'SYSTEM_TEST' | 'FINISHED' - filter by phase
   * @param opts.gym    Include gym contests (default: false)
   */
  async getContests(
    opts: { phase?: string; gym?: boolean } = {},
  ): Promise<CFContest[]> {
    const all = await cachedFetch(
      `cf:contests:gym:${Boolean(opts.gym)}`,
      () =>
        cfGet<CFContest[]>("contest.list", {
          gym: opts.gym ? "true" : "false",
        }),
      60_000, // 1 min
    );
    if (opts.phase) return all.filter((c) => c.phase === opts.phase);
    return all;
  }

  /**
   * Fetch upcoming (BEFORE phase) contests
   * Normalized to UnifiedContest.
   */
  async getUpcomingContests(): Promise<UnifiedContest[]> {
    const contests = await this.getContests({ phase: "BEFORE" });
    return contests.map((c) => ({
      platform: "CODEFORCES" as const,
      id: String(c.id),
      name: c.name,
      startTime: new Date((c.startTimeSeconds ?? 0) * 1000),
      endTime: new Date(((c.startTimeSeconds ?? 0) + c.durationSeconds) * 1000),
      durationSeconds: c.durationSeconds,
      url: `https://codeforces.com/contest/${c.id}`,
    }));
  }

  /**
   * Get a single contest's metadata by ID
   */
  async getContest(contestId: number): Promise<CFContest | null> {
    const all = await this.getContests();
    return all.find((c) => c.id === contestId) ?? null;
  }

  /**
   * Fetch contest standings with pagination
   */
  async getContestStandings(
    contestId: number,
    opts: { from?: number; count?: number; handles?: string[] } = {},
  ): Promise<CFStandings> {
    const from = opts.from ?? 1;
    const count = opts.count ?? 100;
    if (!Number.isInteger(from) || from < 1)
      throw new RangeError("from must be a positive integer");
    if (!Number.isInteger(count) || count < 0)
      throw new RangeError("count must be a non-negative integer");

    const standings = await cachedFetch(
      `cf:standings:${contestId}`,
      () => cfGet<CFStandings>("contest.standings", { contestId }),
      60_000,
    );
    const handles = new Set(
      opts.handles?.map((handle) => handle.toLowerCase()),
    );
    const rows = handles.size
      ? standings.rows.filter((row) =>
          row.party.members.some((member) =>
            handles.has(member.handle.toLowerCase()),
          ),
        )
      : standings.rows;
    return { ...standings, rows: rows.slice(from - 1, from - 1 + count) };
  }

  /**
   * Fetch rating changes for all participants in a contest
   */
  async getContestRatingChanges(contestId: number): Promise<CFRatingChange[]> {
    return cachedFetch(`cf:ratingChanges:${contestId}`, () =>
      cfGet<CFRatingChange[]>("contest.ratingChanges", { contestId }),
    );
  }

  /**
   * Fetch problems for a specific contest
   */
  async getContestProblems(contestId: number): Promise<CFProblem[]> {
    const standings = await this.getContestStandings(contestId, { count: 0 });
    return standings.problems;
  }

  /**
   * Fetch hack attempts in a contest
   */
  async getHackResults(contestId: number): Promise<CFHackResult[]> {
    return cfGet<CFHackResult[]>("contest.hacks", { contestId });
  }

  /**
   * Fetch the top-rated users globally
   */
  async getTopRatedUsers(count: number = 50): Promise<CFUserInfo[]> {
    return cachedFetch(
      `cf:topRated:${count}`,
      () =>
        cfGet<CFUserInfo[]>("user.ratedList", {
          activeOnly: "false",
          includeRetired: "false",
          contestId: "",
        }).then((list) => list.slice(0, count)),
      600_000, // 10 min
    );
  }

  /**
   * Fetch blog entries for a user
   */
  async getBlogEntries(handle: string): Promise<CFBlogEntry[]> {
    return cfGet<CFBlogEntry[]>("user.blogEntries", { handle });
  }

  /**
   * Fetch problem statistics (solve counts)
   */
  async getProblemsetStats(): Promise<Record<string, number>> {
    const result = await cfGet<{
      problems: CFProblem[];
      problemStatistics: Array<{
        contestId: number;
        index: string;
        solvedCount: number;
      }>;
    }>("problemset.problems");
    const stats: Record<string, number> = {};
    for (const s of result.problemStatistics) {
      stats[`${s.contestId}${s.index}`] = s.solvedCount;
    }
    return stats;
  }

  /** Utility: rating → rank string */
  getRankFromRating(rating: number): string {
    return getCFRankFromRating(rating);
  }

  /** Utility: rating → hex color string */
  getRatingColor(rating: number): string {
    return getCFRatingColor(rating);
  }

  /** Health check */
  async isAPIReachable(): Promise<boolean> {
    const [result] = await new Health().check("CODEFORCES");
    return result.reachable;
  }
}
