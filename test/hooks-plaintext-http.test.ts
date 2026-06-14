import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type HookRun = {
  status: number | null;
  stderr: string;
  stdout: string;
  fetches: Array<{ url: string; headers: Record<string, string>; body: string | null }>;
};

type HookName =
  | "post-tool-use"
  | "prompt-submit"
  | "session-end"
  | "pre-tool-use"
  | "pre-compact";

const originalEnv = { ...process.env };

function payloadFor(hook: HookName): Record<string, unknown> {
  if (hook === "post-tool-use" || hook === "pre-tool-use") {
    return {
      session_id: "sess-1",
      cwd: process.cwd(),
      tool_name: "Read",
      tool_input: { file_path: "secret.txt" },
      tool_output: "sensitive output",
    };
  }
  if (hook === "prompt-submit") {
    return {
      session_id: "sess-1",
      cwd: process.cwd(),
      prompt: "sensitive prompt",
    };
  }
  return { session_id: "sess-1", cwd: process.cwd() };
}

function runHook(
  hook: HookName,
  env: Record<string, string>,
): HookRun {
  const dir = mkdtempSync(join(tmpdir(), "agentmemory-hook-"));
  const fetchLog = join(dir, "fetch.jsonl");
  const preload = join(dir, "preload.mjs");
  writeFileSync(
    preload,
    `
import { appendFileSync } from "node:fs";
globalThis.fetch = async (url, init = {}) => {
  appendFileSync(process.env.AGENTMEMORY_FETCH_LOG, JSON.stringify({
    url: String(url),
    headers: init.headers || {},
    body: typeof init.body === "string" ? init.body : null
  }) + "\\n");
  return new Response(JSON.stringify({ context: "ctx", results: [] }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
};
`,
  );
  const result = spawnSync(
    process.execPath,
    ["--import", preload, `plugin/scripts/${hook}.mjs`],
    {
      cwd: process.cwd(),
      env: {
        ...originalEnv,
        ...env,
        AGENTMEMORY_FETCH_LOG: fetchLog,
        AGENTMEMORY_INJECT_CONTEXT:
          env.AGENTMEMORY_INJECT_CONTEXT ?? "",
        CONSOLIDATION_ENABLED: "",
        CLAUDE_MEMORY_BRIDGE: "",
      },
      input: JSON.stringify(payloadFor(hook)),
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  const fetches = existsSync(fetchLog)
    ? readFileSync(fetchLog, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    : [];
  rmSync(dir, { recursive: true, force: true });
  return {
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout,
    fetches,
  };
}

describe("core hooks plaintext bearer guard", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it.each(["post-tool-use", "prompt-submit", "session-end"] as const)(
    "skips %s requests for non-loopback HTTP with a bearer secret",
    (hook) => {
      const result = runHook(hook, {
        AGENTMEMORY_URL: "http://remote.example:3111",
        AGENTMEMORY_SECRET: "secret",
      });

      expect(result.status, result.stderr).toBe(0);
      expect(result.fetches).toEqual([]);
      expect(result.stderr).toContain("plaintext HTTP to http://remote.example:3111");
    },
  );

  it("allows loopback HTTP with a bearer secret", () => {
    const result = runHook("post-tool-use", {
      AGENTMEMORY_URL: "http://localhost:3111",
      AGENTMEMORY_SECRET: "secret",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.fetches).toHaveLength(1);
    expect(result.fetches[0].url).toBe("http://localhost:3111/agentmemory/observe");
    expect(result.fetches[0].headers).toMatchObject({
      Authorization: "Bearer secret",
    });
  });

  it("strict mode exits without sending a request", () => {
    const result = runHook("prompt-submit", {
      AGENTMEMORY_URL: "http://remote.example:3111",
      AGENTMEMORY_SECRET: "secret",
      AGENTMEMORY_REQUIRE_HTTPS: "1",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.fetches).toEqual([]);
    expect(result.stderr).toContain("plaintext HTTP to http://remote.example:3111");
  });

  it.each(["pre-tool-use", "pre-compact"] as const)(
    "skips %s context fetches for non-loopback HTTP with a bearer secret",
    (hook) => {
      const result = runHook(hook, {
        AGENTMEMORY_URL: "http://remote.example:3111",
        AGENTMEMORY_SECRET: "secret",
        AGENTMEMORY_INJECT_CONTEXT: "true",
      });

      expect(result.status, result.stderr).toBe(0);
      expect(result.fetches).toEqual([]);
      expect(result.stderr).toContain("plaintext HTTP to http://remote.example:3111");
      expect(result.stdout).toBe("");
    },
  );

  it.each(["pre-tool-use", "pre-compact"] as const)(
    "%s generated bundle returns cleanly after a guarded context fetch is blocked",
    (hook) => {
      const script = readFileSync(`plugin/scripts/${hook}.mjs`, "utf8");

      expect(script).toContain("const res = await guardedFetch");
      expect(script).toMatch(/if \(!res\) return;\s+if \(res\.ok\)/);
    },
  );
});
