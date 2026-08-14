import { cp } from "./src/index";

async function run() {
  console.log("Fetching upcoming contests...");
  try {
    const contests = await cp.contests.getUpcoming({ limit: 5 });
    console.log(`Found ${contests.length} upcoming contests (limited to 5):`);
    contests.forEach((c) => {
      console.log(
        `- [${c.platform}] ${c.name} at ${c.startTime.toISOString()}`,
      );
    });

    console.log("\nFetching Codeforces user 'tourist'...");
    const cfUser = await cp.codeforces.getUser("tourist");
    console.log(
      `Codeforces: ${cfUser.handle}, Rating: ${cfUser.rating}, Rank: ${cfUser.rank}`,
    );

    console.log("\nFetching AtCoder user 'tourist'...");
    const acUser = await cp.atcoder.getUser("tourist");
    if (acUser) {
      console.log(`AtCoder: ${acUser.user_id}, Rating: ${acUser.rating}`);
    } else {
      console.log(`AtCoder user not found or error.`);
    }
  } catch (error) {
    console.error("Error running test:", error);
  }
}

run();
