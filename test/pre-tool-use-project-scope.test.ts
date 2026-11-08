import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server: Server;
let port: number;
let posts: Array<{ path: string; body: Record<string, unknown> }> = [];

const REPO_NAME = "amem-pretool-fixture";

function runHook(
  payload: Record<string, unknown>,
  env: Record<string, string> = {},
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("node", ["plugin/scripts/pre-tool-use.mjs"], {
      env: {
        ...process.env,
        AGENTMEMORY_URL: `http://127.0.0.1:${port}`,
        AGENTMEMORY_INJECT_CONTEXT: "true",
        AGENTMEMORY_PROJECT_NAME: "",
        ...env,
      },
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

describe("pre-tool-use enrich is project-scoped", () => {
  let tmpRoot: string;
  let repoDir: string;
  let nestedDir: string;

  beforeAll(async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), "am-pretool-"));
    repoDir = join(tmpRoot, REPO_NAME);
    nestedDir = join(repoDir, "src", "deep");
    mkdirSync(nestedDir, { recursive: true });
    execFileSync("git", ["init", "--quiet"], { cwd: repoDir, stdio: "ignore" });

    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          posts.push({ path: req.url ?? "", body: JSON.parse(body || "{}") });
        } catch {
          posts.push({ path: req.url ?? "", body: {} });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ context: "" }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as { port: number }).port;
  });

  afterAll(() => {
    server.close();
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("derives project from the payload cwd", async () => {
    posts = [];
    await runHook({
      session_id: "s1",
      cwd: repoDir,
      tool_name: "Read",
      tool_input: { file_path: join(repoDir, "src", "thing.ts") },
    });

    expect(posts.length).toBe(1);
    expect(posts[0]!.path).toContain("/agentmemory/enrich");
    expect(posts[0]!.body.project).toBe(REPO_NAME);
  });

  it("resolves to the git toplevel from a nested cwd", async () => {
    posts = [];
    await runHook({
      session_id: "s2",
      cwd: nestedDir,
      tool_name: "Edit",
      tool_input: { file_path: join(nestedDir, "x.ts") },
    });

    expect(posts.length).toBe(1);
    expect(posts[0]!.body.project).toBe(REPO_NAME);
  });

  it("never sends an unscoped enrich request", async () => {
    posts = [];
    await runHook({
      session_id: "s3",
      cwd: repoDir,
      tool_name: "Grep",
      tool_input: { pattern: "handleError", path: repoDir },
    });

    expect(posts.length).toBe(1);
    const project = posts[0]!.body.project;
    expect(project).toBeTruthy();
    expect(typeof project).toBe("string");
  });

  it("an explicit payload project still wins (hosts that do supply one)", async () => {
    posts = [];
    await runHook({
      session_id: "s4",
      cwd: repoDir,
      project: "explicit-project",
      tool_name: "Read",
      tool_input: { file_path: join(repoDir, "y.ts") },
    });

    expect(posts.length).toBe(1);
    expect(posts[0]!.body.project).toBe("explicit-project");
  });

  it("skips enrich when the resolved project is empty", async () => {
    posts = [];
    await runHook({
      session_id: "s6",
      cwd: "/",
      tool_name: "Read",
      tool_input: { file_path: "/etc/hosts" },
    });

    expect(posts.length).toBe(0);
  });

  it("stays a no-op when AGENTMEMORY_INJECT_CONTEXT is not true", async () => {
    posts = [];
    await runHook(
      {
        session_id: "s5",
        cwd: repoDir,
        tool_name: "Read",
        tool_input: { file_path: join(repoDir, "z.ts") },
      },
      { AGENTMEMORY_INJECT_CONTEXT: "false" },
    );

    expect(posts.length).toBe(0);
  });
});
