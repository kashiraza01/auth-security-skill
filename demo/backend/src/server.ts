import { createApp } from "./app";
import { connectDb } from "./config/db";
import { env } from "./config/env";

async function main(): Promise<void> {
  await connectDb();
  const app = createApp();
  app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`\n  auth-security-skill backend  →  http://localhost:${env.port}`);
    console.log(`  baseline (vulnerable)        →  http://localhost:${env.port}/api/baseline/auth`);
    console.log(`  hardened                     →  http://localhost:${env.port}/api/hardened/auth`);
    console.log(`  health                       →  http://localhost:${env.port}/api/health\n`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("failed to start:", err);
  process.exit(1);
});
