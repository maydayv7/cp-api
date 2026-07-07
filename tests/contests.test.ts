import { describe, it, expect, vi } from 'vitest';
import { Contests } from '../src/unified/contests';

// We mock the platforms so we don't make real network requests during unit tests
vi.mock('../src/platforms/codeforces', () => {
  return {
    Codeforces: class {
      async getUpcomingContests() {
        return [
          {
            platform: 'CODEFORCES',
            id: '123',
            name: 'Codeforces Round 123',
            startTime: new Date('2026-08-01T10:00:00Z'),
            endTime: new Date('2026-08-01T12:00:00Z'),
            durationSeconds: 7200,
            url: 'https://codeforces.com/contest/123'
          }
        ];
      }
    }
  };
});

vi.mock('../src/platforms/atcoder', () => {
  return {
    AtCoder: class {
      async getUpcomingContests() {
        return [
          {
            platform: 'ATCODER',
            id: 'abc123',
            name: 'AtCoder Beginner Contest 123',
            startTime: new Date('2026-07-20T10:00:00Z'),
            endTime: new Date('2026-07-20T12:00:00Z'),
            durationSeconds: 7200,
            url: 'https://atcoder.jp/contests/abc123'
          }
        ];
      }
    }
  };
});

vi.mock('../src/platforms/codechef', () => {
  return {
    CodeChef: class {
      async getUpcomingContests() {
        throw new Error('CodeChef API Down');
      }
    }
  };
});

vi.mock('../src/platforms/leetcode', () => {
  return {
    LeetCode: class {
      async getUpcomingContests() {
        return [];
      }
    }
  };
});

describe('Unified Contests Fetcher', () => {
  it('should fetch contests from all platforms and sort them by start time', async () => {
    const contestsApi = new Contests();
    
    // We expect it to resolve successfully despite CodeChef failing (Promise.allSettled)
    const upcoming = await contestsApi.getUpcoming();
    
    expect(upcoming.length).toBe(2);
    // AtCoder starts on July 20, CF starts on Aug 1, so AtCoder should be first
    expect(upcoming[0].platform).toBe('ATCODER');
    expect(upcoming[1].platform).toBe('CODEFORCES');
  });

  it('should filter by keywords', async () => {
    const contestsApi = new Contests();
    const upcoming = await contestsApi.getUpcoming({ keywords: ['beginner'] });
    
    expect(upcoming.length).toBe(1);
    expect(upcoming[0].platform).toBe('ATCODER');
  });

  it('should limit the results', async () => {
    const contestsApi = new Contests();
    const upcoming = await contestsApi.getUpcoming({ limit: 1 });
    
    expect(upcoming.length).toBe(1);
    expect(upcoming[0].platform).toBe('ATCODER'); // First one due to sorting
  });
});
