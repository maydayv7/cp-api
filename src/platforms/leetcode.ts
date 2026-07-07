import axios from 'axios';
import { cachedFetch } from '../cache';
import { getConfig } from '../config';
import { UnifiedContest } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LC_GRAPHQL_URL = 'https://leetcode.com/graphql';

const LC_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0',
};

/** Cache TTL: 5 minutes (ms) */
const TTL_5_MIN = 5 * 60 * 1000;

/** Cache TTL: 1 hour (ms) */
const TTL_1_HOUR = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Return-type interfaces
// ---------------------------------------------------------------------------

export interface LCContestBadge {
  name: string;
  expired: boolean;
  hoverText: string;
  icon: string;
}

export interface LCUserProfile {
  ranking: number;
  userAvatar: string;
  realName: string;
  aboutMe: string;
  school: string | null;
  websites: string[];
  countryName: string | null;
  company: string | null;
  jobTitle: string | null;
  skillTags: string[];
  postViewCount: number;
  reputation: number;
  solutionCount: number;
}

export interface LCSubmitStats {
  totalSubmissionNum: Array<{ difficulty: string; count: number; submissions: number }>;
  acSubmissionNum: Array<{ difficulty: string; count: number; submissions: number }>;
}

export interface LCUser {
  username: string;
  realName: string;
  about: string;
  skillTags: string[];
  contestBadge: LCContestBadge | null;
  ranking: number;
  reputation: number;
  starRating: number;
  profile: LCUserProfile;
  submitStats: LCSubmitStats;
}

export interface LCSolvedCount {
  easy: number;
  medium: number;
  hard: number;
  total: number;
}

export interface LCContestHistoryEntry {
  contestTitle: string;
  ranking: number;
  score: number;
  totalProblems: number;
  finishTimeInSeconds: number;
  rating: number;
  attended: boolean;
}

export interface LCProblem {
  questionId: string;
  questionFrontendId: string;
  title: string;
  titleSlug: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  topicTags: Array<{ name: string; slug: string }>;
  isPaidOnly: boolean;
  acRate: number;
  status: string | null;
}

export interface LCProblemDetail extends LCProblem {
  content: string;
  hints: string[];
  exampleTestcases: string;
  codeSnippets: Array<{ lang: string; langSlug: string; code: string }>;
  sampleTestCase: string;
}

export interface LCProblemsOptions {
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  tags?: string[];
  limit?: number;
  skip?: number;
}

export interface LCProblemsResult {
  total: number;
  problems: LCProblem[];
}

export interface LCDailyChallenge {
  date: string;
  link: string;
  question: LCProblemDetail;
}

export interface LCTopicTag {
  name: string;
  id: string;
  slug: string;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Execute a LeetCode GraphQL query.
 * @param query     GraphQL query string
 * @param variables Optional variables object
 * @param timeout   Request timeout in ms
 */
async function lcGraphQL<T = any>(
  query: string,
  variables: Record<string, unknown> = {},
  timeout: number = 15000,
): Promise<T> {
  const response = await axios.post<{ data: T; errors?: any[] }>(
    LC_GRAPHQL_URL,
    { query, variables },
    { timeout, headers: LC_HEADERS },
  );

  if (response.data.errors?.length) {
    throw new Error(`LeetCode GraphQL error: ${JSON.stringify(response.data.errors)}`);
  }

  return response.data.data;
}

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class LeetCode {
  // -------------------------------------------------------------------------
  // Contests
  // -------------------------------------------------------------------------

  /**
   * Fetch all upcoming LeetCode contests.
   *
   * Queries the `upcomingContests` GraphQL field and maps each entry to
   * the shared {@link UnifiedContest} shape.
   *
   * @returns A promise that resolves to an array of upcoming contests.
   */
  async getUpcomingContests(): Promise<UnifiedContest[]> {
    const { http } = getConfig();

    const query = `
      query {
        upcomingContests {
          title
          titleSlug
          startTime
          duration
        }
      }
    `;

    const data = await lcGraphQL<{ upcomingContests: any[] }>(query, {}, http.timeout);
    const contests: any[] = data.upcomingContests ?? [];

    return contests.map((c) => {
      const startTime = new Date(c.startTime * 1000);
      const endTime = new Date((c.startTime + c.duration) * 1000);
      return {
        platform: 'LEETCODE' as const,
        id: c.titleSlug as string,
        name: c.title as string,
        startTime,
        endTime,
        durationSeconds: c.duration as number,
        url: `https://leetcode.com/contest/${c.titleSlug}`,
      };
    });
  }

  // -------------------------------------------------------------------------
  // User
  // -------------------------------------------------------------------------

  /**
   * Fetch a user's public profile.
   *
   * Uses the `userPublicProfile` GraphQL query. Results are cached for
   * **5 minutes**.
   *
   * @param username LeetCode username (handle).
   * @returns The user's profile data including stats and contest badge.
   */
  async getUser(username: string): Promise<LCUser> {
    const { http } = getConfig();

    return cachedFetch(
      `lc:user:${username}`,
      async () => {
        const query = `
          query userPublicProfile($username: String!) {
            matchedUser(username: $username) {
              username
              githubUrl
              twitterUrl
              linkedinUrl
              profile {
                ranking
                userAvatar
                realName
                aboutMe
                school
                websites
                countryName
                company
                jobTitle
                skillTags
                postViewCount
                reputation
                solutionCount
              }
              contestBadge {
                name
                expired
                hoverText
                icon
              }
              submitStats {
                totalSubmissionNum {
                  difficulty
                  count
                  submissions
                }
                acSubmissionNum {
                  difficulty
                  count
                  submissions
                }
              }
            }
          }
        `;

        const data = await lcGraphQL<{ matchedUser: any }>(
          query,
          { username },
          http.timeout,
        );

        const u = data.matchedUser;
        if (!u) throw new Error(`LeetCode user not found: ${username}`);

        return {
          username: u.username,
          realName: u.profile?.realName ?? '',
          about: u.profile?.aboutMe ?? '',
          skillTags: u.profile?.skillTags ?? [],
          contestBadge: u.contestBadge ?? null,
          ranking: u.profile?.ranking ?? 0,
          reputation: u.profile?.reputation ?? 0,
          starRating: 0,
          profile: {
            ranking: u.profile?.ranking ?? 0,
            userAvatar: u.profile?.userAvatar ?? '',
            realName: u.profile?.realName ?? '',
            aboutMe: u.profile?.aboutMe ?? '',
            school: u.profile?.school ?? null,
            websites: u.profile?.websites ?? [],
            countryName: u.profile?.countryName ?? null,
            company: u.profile?.company ?? null,
            jobTitle: u.profile?.jobTitle ?? null,
            skillTags: u.profile?.skillTags ?? [],
            postViewCount: u.profile?.postViewCount ?? 0,
            reputation: u.profile?.reputation ?? 0,
            solutionCount: u.profile?.solutionCount ?? 0,
          },
          submitStats: u.submitStats ?? { totalSubmissionNum: [], acSubmissionNum: [] },
        };
      },
      TTL_5_MIN,
    );
  }

  /**
   * Fetch the number of problems a user has solved, broken down by difficulty.
   *
   * Uses the `userProblemsSolved` GraphQL query. Results are cached for
   * **5 minutes**.
   *
   * @param username LeetCode username (handle).
   * @returns An object with `easy`, `medium`, `hard`, and `total` counts.
   */
  async getUserSolvedCount(username: string): Promise<LCSolvedCount> {
    const { http } = getConfig();

    return cachedFetch(
      `lc:user:solved:${username}`,
      async () => {
        const query = `
          query userProblemsSolved($username: String!) {
            matchedUser(username: $username) {
              submitStats {
                acSubmissionNum {
                  difficulty
                  count
                }
              }
            }
          }
        `;

        const data = await lcGraphQL<{ matchedUser: any }>(
          query,
          { username },
          http.timeout,
        );

        const acNums: Array<{ difficulty: string; count: number }> =
          data.matchedUser?.submitStats?.acSubmissionNum ?? [];

        const get = (diff: string) =>
          acNums.find((x) => x.difficulty === diff)?.count ?? 0;

        return {
          easy: get('Easy'),
          medium: get('Medium'),
          hard: get('Hard'),
          total: get('All'),
        };
      },
      TTL_5_MIN,
    );
  }

  /**
   * Fetch a user's full contest participation history.
   *
   * Uses the `userContestRankingInfo` GraphQL query. Results are cached for
   * **5 minutes**.
   *
   * @param username LeetCode username (handle).
   * @returns An array of contest history entries ordered by most-recent first.
   */
  async getUserContestHistory(username: string): Promise<LCContestHistoryEntry[]> {
    const { http } = getConfig();

    return cachedFetch(
      `lc:user:contests:${username}`,
      async () => {
        const query = `
          query userContestRankingInfo($username: String!) {
            userContestRankingHistory(username: $username) {
              attended
              rating
              ranking
              trendDirection
              problemsSolved
              totalProblems
              finishTimeInSeconds
              contest {
                title
                startTime
              }
            }
          }
        `;

        const data = await lcGraphQL<{ userContestRankingHistory: any[] }>(
          query,
          { username },
          http.timeout,
        );

        const history: any[] = data.userContestRankingHistory ?? [];

        return history.map((h) => ({
          contestTitle: h.contest?.title ?? '',
          ranking: h.ranking ?? 0,
          score: h.problemsSolved ?? 0,
          totalProblems: h.totalProblems ?? 0,
          finishTimeInSeconds: h.finishTimeInSeconds ?? 0,
          rating: h.rating ?? 0,
          attended: h.attended ?? false,
        }));
      },
      TTL_5_MIN,
    );
  }

  // -------------------------------------------------------------------------
  // Problems
  // -------------------------------------------------------------------------

  /**
   * Fetch a paginated list of LeetCode problems, with optional filters.
   *
   * Results are cached for **1 hour** per unique combination of options.
   *
   * @param opts.difficulty  Optional difficulty filter: `'EASY'`, `'MEDIUM'`, or `'HARD'`.
   * @param opts.tags        Optional array of topic-tag slugs to filter by.
   * @param opts.limit       Number of problems to return (default: 50).
   * @param opts.skip        Number of problems to skip for pagination (default: 0).
   * @returns An object containing the `total` problem count and a `problems` array.
   */
  async getProblems(opts: LCProblemsOptions = {}): Promise<LCProblemsResult> {
    const { http } = getConfig();
    const { difficulty, tags = [], limit = 50, skip = 0 } = opts;

    const cacheKey = `lc:problems:${difficulty ?? 'ALL'}:${tags.join(',')}:${limit}:${skip}`;

    return cachedFetch(
      cacheKey,
      async () => {
        const query = `
          query problemsetQuestionList(
            $categorySlug: String
            $limit: Int
            $skip: Int
            $filters: QuestionListFilterInput
          ) {
            problemsetQuestionList: questionList(
              categorySlug: $categorySlug
              limit: $limit
              skip: $skip
              filters: $filters
            ) {
              total: totalNum
              questions: data {
                questionId
                questionFrontendId
                title
                titleSlug
                difficulty
                topicTags {
                  name
                  slug
                }
                isPaidOnly
                acRate
                status
              }
            }
          }
        `;

        const filters: Record<string, unknown> = {};
        if (difficulty) filters['difficulty'] = difficulty;
        if (tags.length > 0) filters['tags'] = tags;

        const data = await lcGraphQL<{ problemsetQuestionList: any }>(
          query,
          { categorySlug: '', limit, skip, filters },
          http.timeout,
        );

        const list = data.problemsetQuestionList ?? {};

        return {
          total: list.total ?? 0,
          problems: (list.questions ?? []).map((q: any) => ({
            questionId: q.questionId,
            questionFrontendId: q.questionFrontendId,
            title: q.title,
            titleSlug: q.titleSlug,
            difficulty: q.difficulty,
            topicTags: q.topicTags ?? [],
            isPaidOnly: q.isPaidOnly ?? false,
            acRate: q.acRate ?? 0,
            status: q.status ?? null,
          })),
        };
      },
      TTL_1_HOUR,
    );
  }

  /**
   * Fetch full details for a single problem by its title slug.
   *
   * Includes description HTML, hints, example test cases, topic tags, and
   * code snippets. Results are cached for **1 hour**.
   *
   * @param titleSlug The URL-safe slug of the problem (e.g. `'two-sum'`).
   * @returns The full problem detail object.
   */
  async getProblem(titleSlug: string): Promise<LCProblemDetail> {
    const { http } = getConfig();

    return cachedFetch(
      `lc:problem:${titleSlug}`,
      async () => {
        const query = `
          query questionData($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
              questionId
              questionFrontendId
              title
              titleSlug
              content
              difficulty
              topicTags {
                name
                slug
              }
              hints
              exampleTestcases
              codeSnippets {
                lang
                langSlug
                code
              }
              isPaidOnly
              acRate
              status
              sampleTestCase
            }
          }
        `;

        const data = await lcGraphQL<{ question: any }>(
          query,
          { titleSlug },
          http.timeout,
        );

        const q = data.question;
        if (!q) throw new Error(`LeetCode problem not found: ${titleSlug}`);

        return {
          questionId: q.questionId,
          questionFrontendId: q.questionFrontendId,
          title: q.title,
          titleSlug: q.titleSlug,
          content: q.content ?? '',
          difficulty: q.difficulty,
          topicTags: q.topicTags ?? [],
          hints: q.hints ?? [],
          exampleTestcases: q.exampleTestcases ?? '',
          codeSnippets: q.codeSnippets ?? [],
          isPaidOnly: q.isPaidOnly ?? false,
          acRate: q.acRate ?? 0,
          status: q.status ?? null,
          sampleTestCase: q.sampleTestCase ?? '',
        };
      },
      TTL_1_HOUR,
    );
  }

  /**
   * Fetch today's LeetCode Daily Challenge problem.
   *
   * Results are cached for **1 hour** (refreshed at most once per hour even
   * if the daily resets in between).
   *
   * @returns The daily challenge object, including the question details.
   */
  async getDailyChallenge(): Promise<LCDailyChallenge> {
    const { http } = getConfig();

    return cachedFetch(
      'lc:daily',
      async () => {
        const query = `
          query questionOfToday {
            activeDailyCodingChallengeQuestion {
              date
              link
              question {
                questionId
                questionFrontendId
                title
                titleSlug
                content
                difficulty
                topicTags {
                  name
                  slug
                }
                hints
                exampleTestcases
                codeSnippets {
                  lang
                  langSlug
                  code
                }
                isPaidOnly
                acRate
                status
                sampleTestCase
              }
            }
          }
        `;

        const data = await lcGraphQL<{ activeDailyCodingChallengeQuestion: any }>(
          query,
          {},
          http.timeout,
        );

        const daily = data.activeDailyCodingChallengeQuestion;
        if (!daily) throw new Error('LeetCode daily challenge not available');

        const q = daily.question;
        return {
          date: daily.date,
          link: daily.link,
          question: {
            questionId: q.questionId,
            questionFrontendId: q.questionFrontendId,
            title: q.title,
            titleSlug: q.titleSlug,
            content: q.content ?? '',
            difficulty: q.difficulty,
            topicTags: q.topicTags ?? [],
            hints: q.hints ?? [],
            exampleTestcases: q.exampleTestcases ?? '',
            codeSnippets: q.codeSnippets ?? [],
            isPaidOnly: q.isPaidOnly ?? false,
            acRate: q.acRate ?? 0,
            status: q.status ?? null,
            sampleTestCase: q.sampleTestCase ?? '',
          },
        };
      },
      TTL_1_HOUR,
    );
  }

  /**
   * Fetch all available topic tags on LeetCode.
   *
   * Results are cached for **1 hour**.
   *
   * @returns An array of topic tag objects with `name`, `id`, and `slug`.
   */
  async getTopicTags(): Promise<LCTopicTag[]> {
    const { http } = getConfig();

    return cachedFetch(
      'lc:topicTags',
      async () => {
        const query = `
          query questionTopicTags {
            questionTopicTags {
              edges {
                node {
                  name
                  id
                  slug
                }
              }
            }
          }
        `;

        const data = await lcGraphQL<{ questionTopicTags: any }>(
          query,
          {},
          http.timeout,
        );

        const edges: any[] = data.questionTopicTags?.edges ?? [];
        return edges.map((e) => ({
          name: e.node.name,
          id: e.node.id,
          slug: e.node.slug,
        }));
      },
      TTL_1_HOUR,
    );
  }

  /**
   * Check whether a user has solved a specific problem.
   *
   * Inspects the user's 20 most recent accepted submissions. Returns `true`
   * if an accepted submission for the given `titleSlug` is found.
   *
   * @param username  LeetCode username (handle).
   * @param titleSlug The URL-safe slug of the problem (e.g. `'two-sum'`).
   * @returns `true` if the problem has been solved, `false` otherwise.
   */
  async isProblemSolved(username: string, titleSlug: string): Promise<boolean> {
    const { http } = getConfig();

    const query = `
      query recentAcSubmissions($username: String!, $limit: Int!) {
        recentAcSubmissionList(username: $username, limit: $limit) {
          titleSlug
        }
      }
    `;

    const data = await lcGraphQL<{ recentAcSubmissionList: any[] }>(
      query,
      { username, limit: 20 },
      http.timeout,
    );

    const submissions: any[] = data.recentAcSubmissionList ?? [];
    return submissions.some((s) => s.titleSlug === titleSlug);
  }
}
