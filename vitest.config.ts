import { defineConfig } from "vitest/config";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";

// Tests must never see the developer's real $HOME: config.ts reads
// ~/.agentmemory/.env underneath process.env, so asserted defaults would
// silently become whatever the local install happens to set — red on clean
// checkouts, green on machines whose .env masks a broken default. Point HOME
// at a throwaway directory for the whole run; tests that need home-dir state
// create their own sandbox and reset HOME themselves.
const testHome = mkdtempSync(join(tmpdir(), "agentmemory-test-home-"));

export default defineConfig({
  test: {
    env: {
      HOME: testHome,
      USERPROFILE: testHome,
    },
  },
});
