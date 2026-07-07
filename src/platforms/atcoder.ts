/**
 * AtCoder API wrapper
 * Uses Kenkoooo AtCoder Problems API (https://github.com/kenkoooo/AtCoderProblems)
 * and direct AtCoder scraping where needed.
 */
import axios from 'axios';
import { cachedFetch } from '../cache';
import { getConfig } from '../config';
import { UnifiedContest } from '../types';

const AC_API = 'https://kenkoooo.com/atcoder';
const AC_MAIN = 'https://atcoder.jp';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ACProblem {
  id: string;
  contest_id: string;
  problem_index: string;
  name: string;
  title: string;
  difficulty?: number;
}

export interface ACProblemModel {
  slope?: number;
  intercept?: number;
  variance?: number;
  difficulty?: number;
  discrimination?: number;
  irt_loglikelihood?: number;
  irt_users?: number;
  is_experimental?: boolean;
}

export interface ACSubmission {
  id: number;
  epoch_second: number;
  problem_id: string;
  contest_id: string;
  user_id: string;
  language: string;
  point: number;
  length: number;
  result: string;
  execution_time: number | null;
}

export interface ACUserInfo {
  user_id: string;
  rating: number;
  highest_rating: number;
  affiliation: string;
  rank: number;
}

export interface ACRatingHistoryEntry {
  IsRated: boolean;
  Place: number;
  OldRating: number;
  NewRating: number;
  Performance: number;
  InnerPerformance: number;
  ContestScreenName: string;
  ContestName: string;
  ContestNameEn: string;
  EndTime: string;
}

export interface ACProblemFilters {
  minDifficulty?: number;
  maxDifficulty?: number;
  contestType?: 'ABC' | 'ARC' | 'AGC' | 'AHC' | string;
}

export interface ACSubmissionFilters {
  fromSecond?: number;
  verdict?: string; // 'AC', 'WA', 'TLE', etc.
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/** Rating-to-rank color mapping for AtCoder */
export function getACRankFromRating(rating: number): string {
  if (rating <= 0) return 'Unrated';
  if (rating < 400) return 'Gray';
  if (rating < 800) return 'Brown';
  if (rating < 1200) return 'Green';
  if (rating < 1600) return 'Cyan';
  if (rating < 2000) return 'Blue';
  if (rating < 2400) return 'Yellow';
  if (rating < 2800) return 'Orange';
  return 'Red';
}

/** Rating-to-hex-color mapping for AtCoder */
export function getACRatingColor(rating: number): string {
  if (rating <= 0) return '#808080';
  if (rating < 400) return '#808080';
  if (rating < 800) return '#804000';
  if (rating < 1200) return '#008000';
  if (rating < 1600) return '#00c0c0';
  if (rating < 2000) return '#0000ff';
  if (rating < 2400) return '#c0c000';
  if (rating < 2800) return '#ff8000';
  return '#ff0000';
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function acApiGet<T>(path: string, params?: Record<string, any>): Promise<T> {
  const { http } = getConfig();
  const { data } = await axios.get(`${AC_API}/${path}`, {
    params,
    timeout: http.timeout,
    headers: { 'User-Agent': http.userAgent },
  });
  return data as T;
}

async function getAllProblems(): Promise<ACProblem[]> {
  return cachedFetch('ac:all_problems', () =>
    acApiGet<ACProblem[]>('resources/problems.json'),
    86_400_000 // 24h
  );
}

async function getAllDifficulties(): Promise<Record<string, ACProblemModel>> {
  return cachedFetch('ac:problem_difficulties', () =>
    acApiGet<Record<string, ACProblemModel>>('resources/problem-models.json'),
    86_400_000 // 24h
  );
}

// ─── AtCoder Class ────────────────────────────────────────────────────────────

export class AtCoder {
  // ── User Methods ──────────────────────────────────────────────────────────

  /**
   * Fetch user profile info including current rating and highest rating.
   * Data is sourced from the user's contest history page on AtCoder.
   */
  async getUser(handle: string): Promise<ACUserInfo | null> {
    return cachedFetch(`ac:user:${handle}`, async () => {
      try {
        const history = await this.getUserRatingHistory(handle);
        if (!history.length) return null;
        const latest = history[history.length - 1];
        const highestRating = Math.max(...history.map(h => h.NewRating));
        return {
          user_id: handle,
          rating: latest.NewRating ?? 0,
          highest_rating: highestRating,
          affiliation: '',
          rank: 0,
        };
      } catch { return null; }
    });
  }

  /**
   * Fetch the full rating history for a user (all rated contests).
   */
  async getUserRatingHistory(handle: string): Promise<ACRatingHistoryEntry[]> {
    const { http } = getConfig();
    try {
      const { data } = await axios.get(`${AC_MAIN}/users/${encodeURIComponent(handle)}/history/json`, {
        timeout: http.timeout,
        headers: { 'User-Agent': http.userAgent },
      });
      return Array.isArray(data) ? data : [];
    } catch { return []; }
  }

  /**
   * Fetch submissions for a user, optionally filtered by verdict and start time.
   */
  async getUserSubmissions(handle: string, filters: ACSubmissionFilters = {}): Promise<ACSubmission[]> {
    const { http } = getConfig();
    const { data } = await axios.get(`${AC_API}/atcoder-api/v3/user/submissions`, {
      params: { user: handle.toLowerCase(), from_second: filters.fromSecond ?? 0 },
      timeout: http.timeout,
      headers: { 'User-Agent': http.userAgent },
    });
    const results: ACSubmission[] = Array.isArray(data) ? data : [];
    if (filters.verdict) return results.filter(s => s.result === filters.verdict);
    return results;
  }

  /**
   * Returns the set of unique problems solved (AC) by a user,
   * with difficulty data enriched from the problem models.
   */
  async getUserSolvedProblems(handle: string, filters: ACProblemFilters = {}): Promise<(ACProblem & { difficulty?: number })[]> {
    const [submissions, allProblems, difficulties] = await Promise.all([
      this.getUserSubmissions(handle),
      getAllProblems(),
      getAllDifficulties(),
    ]);

    const solvedIds = new Set(submissions.filter(s => s.result === 'AC').map(s => s.problem_id));
    const problemMap = new Map(allProblems.map(p => [p.id, p]));

    const solved: (ACProblem & { difficulty?: number })[] = [];
    for (const id of solvedIds) {
      const p = problemMap.get(id);
      if (!p) continue;
      const difficulty = difficulties[id]?.difficulty !== undefined ? Math.round(difficulties[id].difficulty!) : undefined;
      if (filters.minDifficulty !== undefined && (difficulty ?? 0) < filters.minDifficulty) continue;
      if (filters.maxDifficulty !== undefined && (difficulty ?? Infinity) > filters.maxDifficulty) continue;
      if (filters.contestType && !p.contest_id.toUpperCase().startsWith(filters.contestType.toUpperCase())) continue;
      solved.push({ ...p, difficulty });
    }
    return solved;
  }

  /**
   * Check if a user has solved a specific problem.
   */
  async isProblemSolved(handle: string, problemId: string): Promise<boolean> {
    const subs = await this.getUserSubmissions(handle);
    return subs.some(s => s.problem_id === problemId && s.result === 'AC');
  }

  /**
   * Returns current and longest AC submission streaks (in days).
   */
  async getUserStreak(handle: string): Promise<{ current: number; longest: number }> {
    const submissions = await this.getUserSubmissions(handle);
    if (!submissions.length) return { current: 0, longest: 0 };

    const days = new Set(
      submissions
        .filter(s => s.result === 'AC')
        .map(s => {
          const d = new Date(s.epoch_second * 1000);
          return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        })
    );
    const sorted = Array.from(days).sort().reverse();
    let longest = 1, streak = 1;
    for (let i = 1; i < sorted.length; i++) {
      const [y1, m1, d1] = sorted[i - 1].split('-').map(Number);
      const [y2, m2, d2] = sorted[i].split('-').map(Number);
      const diff = Math.round((new Date(y1, m1, d1).getTime() - new Date(y2, m2, d2).getTime()) / 86400000);
      if (diff === 1) { streak++; if (streak > longest) longest = streak; }
      else streak = 1;
    }

    let current = 1;
    for (let i = 1; i < sorted.length; i++) {
      const [y1, m1, d1] = sorted[i - 1].split('-').map(Number);
      const [y2, m2, d2] = sorted[i].split('-').map(Number);
      const diff = Math.round((new Date(y1, m1, d1).getTime() - new Date(y2, m2, d2).getTime()) / 86400000);
      if (diff === 1) current++;
      else break;
    }
    return { current, longest };
  }

  /**
   * Fetch user affiliation by scraping their AtCoder profile page.
   */
  async getUserAffiliation(handle: string): Promise<string | null> {
    const { http } = getConfig();
    try {
      const { data: html } = await axios.get(`${AC_MAIN}/users/${encodeURIComponent(handle)}`, {
        timeout: http.timeout,
        responseType: 'text',
        headers: { 'User-Agent': http.userAgent },
      });
      const m = html.match(/Affiliation[^<]*<\/th>[^<]*<td[^>]*>([^<]*)<\/td>/i);
      return m ? m[1].trim() : null;
    } catch { return null; }
  }

  // ── Problem Methods ───────────────────────────────────────────────────────

  /**
   * Fetch all problems, optionally filtered by difficulty range and contest type.
   * Enriched with difficulty data from the problem models.
   */
  async getProblems(filters: ACProblemFilters = {}): Promise<(ACProblem & { difficulty?: number })[]> {
    const [problems, difficulties] = await Promise.all([getAllProblems(), getAllDifficulties()]);

    return problems
      .map(p => ({ ...p, difficulty: difficulties[p.id]?.difficulty !== undefined ? Math.round(difficulties[p.id].difficulty!) : undefined }))
      .filter(p => {
        if (filters.minDifficulty !== undefined && (p.difficulty ?? 0) < filters.minDifficulty) return false;
        if (filters.maxDifficulty !== undefined && (p.difficulty ?? Infinity) > filters.maxDifficulty) return false;
        if (filters.contestType && !p.contest_id.toUpperCase().startsWith(filters.contestType.toUpperCase())) return false;
        return true;
      });
  }

  /**
   * Fetch a single problem by ID, enriched with difficulty.
   */
  async getProblem(problemId: string): Promise<(ACProblem & { difficulty?: number }) | null> {
    const [problems, difficulties] = await Promise.all([getAllProblems(), getAllDifficulties()]);
    const p = problems.find(p => p.id === problemId);
    if (!p) return null;
    return { ...p, difficulty: difficulties[problemId]?.difficulty !== undefined ? Math.round(difficulties[problemId].difficulty!) : undefined };
  }

  /**
   * Fetch all problems for a specific contest.
   */
  async getContestProblems(contestId: string): Promise<(ACProblem & { difficulty?: number })[]> {
    const [problems, difficulties] = await Promise.all([getAllProblems(), getAllDifficulties()]);
    return problems
      .filter(p => p.contest_id === contestId)
      .map(p => ({ ...p, difficulty: difficulties[p.id]?.difficulty !== undefined ? Math.round(difficulties[p.id].difficulty!) : undefined }));
  }

  /**
   * Fetch raw difficulty models for all problems.
   */
  async getProblemDifficulties(): Promise<Record<string, ACProblemModel>> {
    return getAllDifficulties();
  }

  // ── Contest Methods ───────────────────────────────────────────────────────

  /**
   * Fetch upcoming (and optionally ongoing) AtCoder contests by scraping atcoder.jp.
   */
  async getUpcomingContests(): Promise<UnifiedContest[]> {
    const { http } = getConfig();
    const { data: html } = await axios.get('https://atcoder.jp/contests/?lang=en', {
      timeout: http.timeout,
      responseType: 'text',
      headers: { 'User-Agent': http.userAgent },
    });

    const contests: UnifiedContest[] = [];
    const upcomingSection = html.match(/id="contest-table-upcoming"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
    const ongoingSection = html.match(/id="contest-table-action"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);

    for (const section of [upcomingSection?.[1], ongoingSection?.[1]].filter(Boolean)) {
      const rowRegex = /<tr>[\s\S]*?<time[^>]*>([^<]+)<\/time>[\s\S]*?<a href="\/contests\/([^"]+)">([^<]+)<\/a>[\s\S]*?<td class="text-center">(\d+):(\d+)<\/td>[\s\S]*?<\/tr>/g;
      let m;
      while ((m = rowRegex.exec(section!)) !== null) {
        const [, timeStr, contestId, name, hours, minutes] = m;
        const startTime = new Date(timeStr.trim());
        if (isNaN(startTime.getTime())) continue;
        const durationSeconds = parseInt(hours) * 3600 + parseInt(minutes) * 60;
        contests.push({
          platform: 'ATCODER',
          id: contestId,
          name: name.trim(),
          startTime,
          endTime: new Date(startTime.getTime() + durationSeconds * 1000),
          durationSeconds,
          url: `https://atcoder.jp/contests/${contestId}`,
        });
      }
    }
    return contests;
  }

  // ── Leaderboard ───────────────────────────────────────────────────────────

  /**
   * Fetch the top-rated AtCoder users by scraping the user list.
   * Returns up to `count` users (default 50).
   */
  async getTopRatedUsers(count: number = 50): Promise<Array<{ handle: string; rating: number; country: string }>> {
    const { http } = getConfig();
    const { data: html } = await axios.get(`${AC_MAIN}/ranking?contestType=algo`, {
      timeout: http.timeout,
      responseType: 'text',
      headers: { 'User-Agent': http.userAgent },
    });
    const results: Array<{ handle: string; rating: number; country: string }> = [];
    const rowRegex = /<tr>[\s\S]*?<a href="\/users\/([^"]+)">[\s\S]*?<\/a>[\s\S]*?<td[^>]*>(\d+)<\/td>[\s\S]*?<\/tr>/g;
    let m;
    while ((m = rowRegex.exec(html)) !== null && results.length < count) {
      results.push({ handle: m[1], rating: parseInt(m[2]), country: '' });
    }
    return results;
  }

  /** Utility: rating → rank color string */
  getRankFromRating(rating: number): string { return getACRankFromRating(rating); }

  /** Utility: rating → hex color string */
  getRatingColor(rating: number): string { return getACRatingColor(rating); }

  /** Health check using Kenkoooo API */
  async isAPIReachable(): Promise<boolean> {
    try {
      await axios.get(`${AC_API}/resources/problems.json`, {
        timeout: 8000,
        headers: { Range: 'bytes=0-100' },
      });
      return true;
    } catch { return false; }
  }
}
