# @ronit/cp-api 🏆

> One unified, fault-tolerant SDK to fetch upcoming contests, user profiles, problem sets, submissions, and analytics from all major competitive programming platforms.

[![npm version](https://img.shields.io/npm/v/@ronit/cp-api.svg?style=flat)](https://www.npmjs.com/package/@ronit/cp-api)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Scraping and aggregating competitive programming data is notoriously fragmented. Codeforces has a clean REST API, LeetCode requires GraphQL, and AtCoder lacks a reliable official API. 

**`@ronit/cp-api` abstracts all this pain away.** It provides a single, robust, and highly configurable TypeScript API replacing hundreds of lines of scraping code with single-line, declarative commands.

## ✨ Features
* **🌐 Universal Support**: Natively supports **Codeforces**, **AtCoder**, **LeetCode**, and **CodeChef**.
* **🚀 Unified API**: Fetch aggregated upcoming contests, compare users across platforms, and get unified analytics.
* **🛡️ Production-Grade Resilience**: Built-in HTTP client with exponential backoff, jitter, and automatic retry on 429/503.
* **🚦 Intelligent Rate Limiting**: Token-bucket rate limiting configurable per-platform to never get IP-banned.
* **⚡ Blazing Fast Cache**: Built-in LRU caching for all endpoints to minimize network overhead.
* **📊 Analytics Engine**: Compute common solved problems, rating progress, and tag/difficulty distributions on the fly.
* **🎯 Strongly Typed**: 100% TypeScript with full interfaces for all platform responses.

## 📦 Installation

```bash
npm install @ronit/cp-api
# or
yarn add @ronit/cp-api
# or
pnpm add @ronit/cp-api
```

## 🛠️ Configuration

Configure the SDK globally. It uses deep-merging, so you only need to specify what you want to change:

```typescript
import { cp } from '@ronit/cp-api';

cp.configure({
  rateLimit: {
    enabled: true,
    strategy: 'token-bucket',
    onRateLimit: 'wait',
    platforms: {
      codeforces: { requestsPerSecond: 2 }, // Aggressive
      leetcode: { requestsPerSecond: 0.5 }  // Conservative
    }
  },
  http: {
    timeout: 15000,
    maxRetries: 3
  },
  cache: {
    enabled: true,
    ttlMs: 5 * 60 * 1000 // 5 minutes
  }
});
```

## 🚀 Quick Start

### 1. The Unified Contests Feed
Get all upcoming contests across all platforms, sorted by start time:

```typescript
const upcoming = await cp.contests.getUpcoming({
  platforms: ['CODEFORCES', 'LEETCODE', 'ATCODER'],
  keywords: ['div. 2', 'weekly'], // Filter by name
  limit: 5
});
```

### 2. Comprehensive User Profiles
Fetch a user's unified data, optionally pulling in their full problem history and streaks in parallel:

```typescript
const profile = await cp.users.get('tourist', {
  platforms: ['CODEFORCES', 'ATCODER'],
  includeSubmissions: true,
  includeStreak: true,
  includeRatingHistory: true
});
```

### 3. Analytics & Insights
Compare multiple users or get deep insights into a single user's performance:

```typescript
// Find problems solved by both users
const common = await cp.analytics.getCommonSolvedProblems(['tourist', 'jiangly'], 'CODEFORCES');

// Get tag distribution (e.g. dp: 150, math: 120, graphs: 90)
const tags = await cp.analytics.getTagDistribution('tourist');

// Get difficulty distribution buckets
const difficulty = await cp.analytics.getDifficultyDistribution('tourist', 'CODEFORCES');
// Returns: { '<800': 10, '800-1199': 45, '2400+': 890 }
```

## 🧩 Deep-Dive Platform APIs
If you need platform-specific features, access them directly through the singleton:

### Codeforces
```typescript
const heatmap = await cp.codeforces.getUserActivityHeatmap('tourist');
const randomHard = await cp.codeforces.getRandomProblem({ minRating: 2400, tags: ['dp'] });
const hacks = await cp.codeforces.getHackResults('1234');
```

### LeetCode
```typescript
const daily = await cp.leetcode.getDailyChallenge();
const solvedCount = await cp.leetcode.getUserSolvedCount('neal_wu');
```

### AtCoder
```typescript
const acProblems = await cp.atcoder.getUserSolvedProblems('tourist', { minDifficulty: 2000 });
const ranking = await cp.atcoder.getTopRatedUsers(100);
```

## 🩺 System Health & Observability

Ensure all platforms are reachable before running batch jobs:
```typescript
const health = await cp.health.check();
console.log(health.filter(h => !h.reachable)); // Find downed platforms
```

Listen to internal events for logging:
```typescript
cp.on('fetch:error', (data) => console.error(`Failed ${data.platform}:`, data.error));
cp.on('rateLimit:wait', (data) => console.warn(`Throttling ${data.platform}...`));
```

## 🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check [issues page](https://github.com/ronit/cp-api/issues).

## 📝 License
This project is [MIT](https://opensource.org/licenses/MIT) licensed.
