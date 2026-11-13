import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";

type HookName = "session-start" | "prompt-submit" | "pre-tool-use" | "post-tool-use" | "stop";

interface Request {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

interface SpoolRecord {
  eventId: string;
  reason: string;
  body: Record<string, unknown>;
}

interface HookResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  elapsedMs: number;
  stdout: string;
  stderr: string;
  requests: Request[];
  spooled: SpoolRecord[];
}

const root = fileURLToPath(new URL("../../", import.meta.url));
const loader = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;
const preload = pathToFileURL(join(root, "test/fixtures/hook-source-fetch.mjs")).href;

function lines<T>(path: string): T[] {
  return existsSync(path)
    ? readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as T)
    : [];
}

export async function runSourceHook(
  name: HookName,
  payload: Record<string, unknown> | string,
  options: {
    fetch?: "success" | "unreachable" | "hanging";
    env?: Record<string, string>;
  } = {},
): Promise<HookResult> {
  const dir = mkdtempSync(join(tmpdir(), "am-hook-source-"));
  const requests = join(dir, "requests.jsonl");
  const spool = join(dir, "spool");
  const startedAt = performance.now();
  try {
    const result = await new Promise<Omit<HookResult, "requests" | "spooled">>((done, reject) => {
      const child = spawn(process.execPath, [
        "--import", loader,
        "--import", preload,
        resolve(root, "src/hooks", `${name}.ts`),
      ], {
        cwd: dir,
        env: {
          PATH: process.env["PATH"],
          SystemRoot: process.env["SystemRoot"],
          HOME: dir,
          USERPROFILE: dir,
          APPDATA: dir,
          LOCALAPPDATA: dir,
          TEMP: dir,
          TMP: dir,
          AGENTMEMORY_URL: "http://127.0.0.1:3111",
          AGENTMEMORY_SECRET: "source-hook-test-secret",
          AGENTMEMORY_PROJECT_NAME: "source-hook-project",
          AGENTMEMORY_INJECT_CONTEXT: "true",
          AGENTMEMORY_CAPTURE_SPOOL_DIR: spool,
          AGENTMEMORY_HOOK_TEST_FETCH: options.fetch ?? "success",
          AGENTMEMORY_HOOK_TEST_REQUESTS: requests,
          ...options.env,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`${name} exceeded the test deadline: ${stderr}`));
      }, 7000);
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        done({ code, signal, stdout, stderr, elapsedMs: performance.now() - startedAt });
      });
      child.stdin.on("error", () => {});
      child.stdin.end(typeof payload === "string" ? payload : JSON.stringify(payload));
    });
    return {
      ...result,
      requests: lines<Request>(requests),
      spooled: existsSync(spool)
        ? readdirSync(spool).filter((name) => name.endsWith(".jsonl"))
          .flatMap((name) => lines<SpoolRecord>(join(spool, name)))
        : [],
    };
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

export function expectExit(result: HookResult, stdout = ""): void {
  expect(result.code, result.stderr).toBe(0);
  expect(result.signal).toBeNull();
  expect(result.elapsedMs).toBeLessThan(5000);
  expect(result.stdout).toBe(stdout);
}

export function expectPost(request: Request | undefined, path: string): asserts request is Request {
  expect(request).toBeDefined();
  expect(request!.url).toBe(`http://127.0.0.1:3111${path}`);
  expect(request!.method).toBe("POST");
  expect(request!.headers).toEqual({
    authorization: "Bearer source-hook-test-secret",
    "content-type": "application/json",
  });
}

export function failureCases(
  name: HookName,
  payload: Record<string, unknown>,
  options: { capture: boolean; requestPaths: string[] },
): void {
  it.each(["{broken", "null", "7"])("ignores malformed stdin %s", async (input) => {
    const result = await runSourceHook(name, input);
    expectExit(result);
    expect(result.requests).toEqual([]);
    expect(result.spooled).toEqual([]);
  });

  it.each(["environment", "payload"])("ignores SDK child context from %s", async (source) => {
    const result = await runSourceHook(name,
      source === "payload" ? { ...payload, entrypoint: "sdk-ts" } : payload,
      { env: source === "environment" ? { AGENTMEMORY_SDK_CHILD: "1" } : {} },
    );
    expectExit(result);
    expect(result.requests).toEqual([]);
    expect(result.spooled).toEqual([]);
  });

  it.each(["unreachable", "hanging"] as const)("exits successfully when fetch is %s", async (mode) => {
    const result = await runSourceHook(name, payload, { fetch: mode });
    expectExit(result);
    expect(result.requests.map((request) => new URL(request.url).pathname)).toEqual(options.requestPaths);
    if (options.capture) {
      expect(result.spooled).toHaveLength(1);
      expect(result.spooled[0]).toMatchObject({
        eventId: result.requests[0]!.body["eventId"],
        reason: mode === "unreachable" ? "unreachable" : "timeout",
        body: result.requests[0]!.body,
      });
    } else {
      expect(result.spooled).toEqual([]);
    }
  }, 10_000);

  it("refuses a secret over non-loopback HTTP without fetching or spooling", async () => {
    const result = await runSourceHook(name, payload, {
      env: { AGENTMEMORY_URL: "http://untrusted.example:3111" },
    });
    expectExit(result);
    expect(result.stderr).toContain("must use HTTPS");
    expect(result.requests).toEqual([]);
    expect(result.spooled).toEqual([]);
  });
}
