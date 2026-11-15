import { afterEach, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mockKV, mockSdk } from "./helpers/mocks.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
afterEach(() => vi.resetModules());
const run = promisify(execFile);

it("runs the actual one-shot CLI through authenticated local HTTP and real capture/observe with only synthetic GitHub reads", async () => {
  vi.resetModules();
  const { registerObserveFunction } = await import("../src/functions/observe.js");
  const { registerCaptureFunctions } = await import("../src/functions/capture.js");
  const { registerApiTriggers } = await import("../src/triggers/api.js");
  const { KV } = await import("../src/state/schema.js");
  const kv = mockKV();
  const sdk = mockSdk({ looseTrigger: true });
  registerObserveFunction(sdk as never, kv as never);
  registerCaptureFunctions(sdk as never, kv as never);
  registerApiTriggers(sdk as never, kv as never, "cli-store-only-secret");
  const bodies: Array<Record<string, unknown>> = [];
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "POST" || request.url !== "/agentmemory/observe") throw new Error("Unexpected local fixture path");
      const auth = await sdk.trigger({ function_id: "middleware::api-auth", payload: { request: {
        method: request.method, headers: { authorization: request.headers.authorization, "content-type": request.headers["content-type"] },
      } } }) as { action: string };
      if (auth.action !== "continue") throw new Error("Local fixture authorization failed");
      let text = "";
      request.setEncoding("utf8");
      for await (const part of request) text += String(part);
      const body: unknown = JSON.parse(text);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid local fixture body");
      bodies.push(body as Record<string, unknown>);
      const result = await sdk.trigger({ function_id: "api::observe", payload: { body } }) as
        { status_code: number; body: Record<string, unknown> };
      response.writeHead(result.status_code, { "content-type": "application/json" });
      response.end(JSON.stringify(result.body));
    } catch {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Local fixture failed" }));
    }
  });
  const sandbox = mkdtempSync(join(tmpdir(), "github-issue-cli-"));
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Local fixture did not bind a TCP port");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const requests = join(sandbox, "source-requests.jsonl");
    const fixture = join(sandbox, "fixture.json");
    const preload = join(sandbox, "synthetic-github.mjs");
    writeFileSync(fixture, JSON.stringify({
      target: `${baseUrl}/agentmemory/observe`, requests,
      repo: { id: 123, full_name: "owner/repo", private: false },
      issue: { id: 456, number: 7, title: "Choose stable project identity", body: "Keep review decisions with the checkout's project.",
        state: "open", updated_at: "2026-11-10T12:00:00Z", html_url: "https://github.com/owner/repo/issues/7" },
    }));
    writeFileSync(preload, `import { readFileSync, appendFileSync } from "node:fs";
const f = JSON.parse(readFileSync(process.env.GITHUB_CONNECTOR_TEST_FIXTURE, "utf8"));
const original = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (url === f.target) return original(input, init);
  if (!url.startsWith("https://api.github.com/repos/owner/repo")) throw new Error("Real source network denied by fixture");
  appendFileSync(f.requests, JSON.stringify({ url, authorization: new Headers(init.headers).get("authorization") }) + "\\n");
  return Response.json(url === "https://api.github.com/repos/owner/repo" ? f.repo : [f.issue]);
};
`);
    const { stdout, stderr } = await run(process.execPath, ["--import", preload, "integrations/github-watcher/bin.mjs",
      "--repo", "owner/repo", "--project", "example-project", "--cwd", "/work/example-project", "--url", baseUrl], {
      env: { ...process.env, HOME: sandbox, USERPROFILE: sandbox, GITHUB_CONNECTOR_TEST_FIXTURE: fixture,
        GH_TOKEN: "cli-github-only-token", GITHUB_TOKEN: "", AGENTMEMORY_SECRET: "cli-store-only-secret" },
      timeout: 12_000,
    });
    expect(JSON.parse(stdout)).toEqual({ complete: true, pages: 1, issues: 1, completed: 1, duplicates: 0, notModifiedPages: 0 });
    expect(stderr).toBe("");
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ eventId: "gh_de4f949794228efe9acaffea7949d7511e455735dfe9ee361c0025297bb0e68c",
      sessionId: "gh_123_issue_456", project: "example-project", cwd: "/work/example-project" });
    expect([...(kv.store.get(KV.observations("gh_123_issue_456"))?.values() ?? [])]).toHaveLength(1);
    const reads = readFileSync(requests, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { url: string; authorization: string | null });
    expect(reads).toHaveLength(2);
    expect(reads[0]).toEqual({ url: "https://api.github.com/repos/owner/repo", authorization: "Bearer cli-github-only-token" });
    expect(reads[1]!.authorization).toBeNull();
    expect(reads[1]!.url).toContain("state=all&sort=updated&direction=asc&per_page=100");
    expect(JSON.stringify(bodies)).not.toMatch(/cli-github-only-token|cli-store-only-secret/);
    expect(stdout + stderr).not.toMatch(/cli-github-only-token|cli-store-only-secret/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(sandbox, { recursive: true, force: true });
  }
}, 15_000);
