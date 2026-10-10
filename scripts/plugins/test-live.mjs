import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (!process.env.AGENTMEMORY_TEST_III) {
  console.error("Set AGENTMEMORY_TEST_III to the absolute path of the pinned iii binary before running the live test.");
  process.exit(1);
}
const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../node_modules/vitest/vitest.mjs", import.meta.url)), "run", "test/codex-live-daemon.test.ts"], { stdio: "inherit" });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
