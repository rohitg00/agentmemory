#!/usr/bin/env node
import("@agentmemory/agentmemory/dist/standalone.mjs").catch((err) => {
  console.error(
    "[@agentmemory/mcp] Failed to load standalone entrypoint from @agentmemory/agentmemory.",
  );
  console.error(
    "[@agentmemory/mcp] Try installing manually: npm i -g @agentmemory/agentmemory",
  );
  console.error(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
