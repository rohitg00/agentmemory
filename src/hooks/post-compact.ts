#!/usr/bin/env node

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

async function post(path: string, body: Record<string, unknown>, timeoutMs: number): Promise<void> {
  try {
    const response = await fetch(`${REST_URL}/agentmemory${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      process.stderr.write(
        `[agentmemory] post-compact POST ${path} failed: ${response.status} ${response.statusText}\n`,
      );
    }
  } catch (err) {
    process.stderr.write(
      `[agentmemory] post-compact POST ${path} failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
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

  if (isSdkChildContext(data)) return;

  const sessionId = typeof data.session_id === "string" && data.session_id.trim()
    ? data.session_id.trim()
    : undefined;
  if (!sessionId) return;
  const cwd = (data.cwd as string) || process.cwd();

  await post("/observe", {
    hookType: "session_compacted",
    sessionId,
    project: cwd,
    cwd,
    timestamp: new Date().toISOString(),
    data: {
      source: "codex_post_compact",
      summary: data.summary || data.compaction || null,
    },
  }, 3000);

  await post("/summarize", { sessionId }, 120000);

  if (process.env["CONSOLIDATION_ENABLED"] === "true") {
    await post("/crystals/auto", { olderThanDays: 0 }, 60000);
    await post("/consolidate-pipeline", { tier: "all", force: true }, 120000);
  }
}

main();
