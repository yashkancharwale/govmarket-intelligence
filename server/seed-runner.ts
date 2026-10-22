import { closeDatabase } from "./db";
import { seedSyntheticFixtures } from "./seed";

try {
  const result = await seedSyntheticFixtures();
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Synthetic seed failed.");
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
