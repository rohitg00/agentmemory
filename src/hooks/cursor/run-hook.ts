#!/usr/bin/env node
import { delegateHook, isCursorHookKey, type HookPayload } from "./delegate.js";

// CLI entrypoint for Cursor's synchronous hooks. Kept separate from
// delegate.ts so importing the dispatcher never starts a second stdin
// reader in the same process (run-detached.ts depends on that).
async function main(): Promise<void> {
  const hookKey = process.argv[2];
  if (!isCursorHookKey(hookKey)) process.exit(0);

  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  if (!input.trim()) process.exit(0);

  let data: HookPayload;
  try {
    data = JSON.parse(input) as HookPayload;
  } catch {
    process.exit(0);
  }

  process.exit(delegateHook(hookKey, data));
}

main();
