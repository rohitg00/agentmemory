#!/usr/bin/env node

// Inlined — see src/hooks/sdk-guard.ts for canonical version. Kept local
// per-hook so tsdown does not emit a shared hashed chunk that would churn
// the diff on every rebuild.
function isSdkChildContext(payload: unknown): boolean {
  if (process.env["AGENTMEMORY_SDK_CHILD"] === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  return (payload as { entrypoint?: unknown }).entrypoint === "sdk-ts";
}

const REST_URL = process.env["AGENTMEMORY_URL"] || "http://localhost:3111";
const SECRET = process.env["AGENTMEMORY_SECRET"] || "";

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (SECRET) h["Authorization"] = `Bearer ${SECRET}`;
  return h;
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(input);
  } catch {
    return;
  }

  if (isSdkChildContext(data)) {
    // Do not summarize from inside a Claude Agent SDK child session;
    // would re-enter agent-sdk provider and loop (see sdk-guard.ts).
    return;
  }

  const sessionId = (data.session_id as string) || "unknown";

  // Fire-and-forget: don't block the Stop hook (and therefore Claude
  // Code's next-prompt boundary) on the daemon's summarize work, which
  // can run minutes per turn on long sessions / slow LLM providers.
  //
  // Subtlety: dropping the `await` is NOT enough. Node keeps the event
  // loop alive waiting for any pending fetch() to settle, so without an
  // explicit exit the script still hangs until the AbortSignal.timeout
  // fires (~120s on slow providers). The unref'd setTimeout below
  // forcibly exits 500ms after firing the request, which is plenty of
  // time for the POST to flush to the local daemon's socket buffer.
  fetch(`${REST_URL}/agentmemory/summarize`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ sessionId }),
    signal: AbortSignal.timeout(120000),
  }).catch(() => {
    // summarize is best-effort
  });
  setTimeout(() => process.exit(0), 500).unref();
}

main();