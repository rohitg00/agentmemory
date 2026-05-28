import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const repoRoot = resolve(__dirname, "..");
const pluginRoot = join(repoRoot, "plugin");

function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

const SUPPORTED_COPILOT_EVENTS = new Set([
  "sessionStart",
  "userPromptSubmitted",
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
  "preCompact",
  "agentStop",
  "sessionEnd",
  "subagentStart",
  "subagentStop",
  "notification",
]);

const REQUIRED_MINIMUM_EVENTS = [
  "sessionStart",
  "userPromptSubmitted",
  "preToolUse",
  "postToolUse",
  "agentStop",
];

const KNOWN_SKILL_DIRS = [
  "recall",
  "remember",
  "session-history",
  "forget",
  "handoff",
  "recap",
  "commit-context",
  "commit-history",
];

describe("Copilot plugin manifest (plugin/plugin.json)", () => {
  it("manifest exists with kebab-case name, version, and required fields", () => {
    const manifestPath = join(pluginRoot, "plugin.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = readJson<{
      name: string;
      version: string;
      description?: string;
      skills?: string;
      mcpServers?: string;
      hooks?: string;
    }>(manifestPath);
    expect(manifest.name).toBe("agentmemory");
    expect(manifest.name).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(manifest.skills).toBeDefined();
    expect(manifest.mcpServers).toBeDefined();
    expect(manifest.hooks).toBeDefined();
  });

  it("manifest version matches main package.json", () => {
    const pkgVer = readJson<{ version: string }>(join(repoRoot, "package.json")).version;
    const pluginVer = readJson<{ version: string }>(
      join(pluginRoot, "plugin.json"),
    ).version;
    expect(pluginVer).toBe(pkgVer);
  });

  it("all referenced manifest paths resolve to existing files / directories", () => {
    const manifest = readJson<{ skills: string; mcpServers: string; hooks: string }>(
      join(pluginRoot, "plugin.json"),
    );
    const manifestDir = pluginRoot;
    expect(existsSync(resolve(manifestDir, manifest.skills))).toBe(true);
    expect(existsSync(resolve(manifestDir, manifest.mcpServers))).toBe(true);
    expect(existsSync(resolve(manifestDir, manifest.hooks))).toBe(true);
  });

  it("skills path resolves and contains all known skill directories", () => {
    const manifest = readJson<{ skills: string }>(join(pluginRoot, "plugin.json"));
    const manifestDir = pluginRoot;
    const skillsPath = resolve(manifestDir, manifest.skills);
    for (const skill of KNOWN_SKILL_DIRS) {
      expect(
        existsSync(join(skillsPath, skill)),
        `missing skill directory: ${skill}`,
      ).toBe(true);
    }
  });
});

describe("Copilot MCP config (.mcp.copilot.json)", () => {
  it("file exists with expected shape", () => {
    const mcpPath = join(pluginRoot, ".mcp.copilot.json");
    expect(existsSync(mcpPath)).toBe(true);
    const config = readJson<{
      mcpServers: {
        agentmemory: {
          type: string;
          command: string;
          args: string[];
          env: Record<string, string>;
          tools: string[];
        };
      };
    }>(mcpPath);
    const server = config.mcpServers.agentmemory;
    expect(server.type).toBe("local");
    expect(server.command).toBe("npx");
    expect(server.args).toEqual(["-y", "@agentmemory/mcp"]);
    expect(server.env["AGENTMEMORY_URL"]).toBe(
      "${AGENTMEMORY_URL:-http://localhost:3111}",
    );
    expect(server.env["AGENTMEMORY_SECRET"]).toBe("${AGENTMEMORY_SECRET:-}");
    expect(server.env["AGENTMEMORY_TOOLS"]).toBe("${AGENTMEMORY_TOOLS:-all}");
    expect(server.tools).toContain("*");
  });
});

describe("Copilot hooks config (hooks/hooks.copilot.json)", () => {
  type HookEntry = {
    type: string;
    command?: string;
    bash?: string;
    powershell?: string;
    matcher?: string;
  };

  function loadHooks() {
    return readJson<{ version: number; hooks: Record<string, HookEntry[]> }>(
      join(pluginRoot, "hooks/hooks.copilot.json"),
    );
  }

  it("has top-level version === 1 and hooks object", () => {
    const config = loadHooks();
    expect(config.version).toBe(1);
    expect(config.hooks).toBeDefined();
    expect(typeof config.hooks).toBe("object");
  });

  it("contains only supported Copilot event names", () => {
    const config = loadHooks();
    for (const event of Object.keys(config.hooks)) {
      expect(
        SUPPORTED_COPILOT_EVENTS.has(event),
        `unsupported event "${event}" in hooks.copilot.json`,
      ).toBe(true);
    }
  });

  it("contains all required minimum events", () => {
    const config = loadHooks();
    const events = Object.keys(config.hooks);
    for (const event of REQUIRED_MINIMUM_EVENTS) {
      expect(events, `missing required event: ${event}`).toContain(event);
    }
  });

  it("PreToolUse entry has the correct matcher", () => {
    const config = loadHooks();
    const preToolEntries = config.hooks["preToolUse"];
    expect(preToolEntries).toBeDefined();
    const withMatcher = preToolEntries.find(
      (e) => e.matcher === "edit|write|create|read|view|glob|grep",
    );
    expect(
      withMatcher,
      "PreToolUse must have matcher edit|write|create|read|view|glob|grep",
    ).toBeDefined();
  });

  it("every handler has type === 'command' and exactly one of command/bash/powershell", () => {
    const config = loadHooks();
    for (const [event, entries] of Object.entries(config.hooks)) {
      for (const handler of entries) {
        expect(handler.type, `${event} handler type`).toBe("command");
        const commandFields = [handler.command, handler.bash, handler.powershell].filter(
          (v): v is string => typeof v === "string" && v.trim().length > 0,
        );
        expect(
          commandFields.length,
          `${event} handler must have exactly one of command/bash/powershell`,
        ).toBe(1);
      }
    }
  });

  it("every referenced script exists on disk", () => {
    const config = loadHooks();
    const scriptRefs = new Set<string>();
    for (const entries of Object.values(config.hooks)) {
      for (const handler of entries) {
        const cmd = handler.command ?? handler.bash ?? handler.powershell ?? "";
        const match = cmd.match(/\$\{(?:COPILOT_PLUGIN_ROOT|CLAUDE_PLUGIN_ROOT)\}\/(scripts\/[^\s]+)/);
        if (match) scriptRefs.add(match[1]);
      }
    }
    expect(scriptRefs.size).toBeGreaterThan(0);
    for (const rel of scriptRefs) {
      expect(existsSync(join(pluginRoot, rel)), `missing hook script: ${rel}`).toBe(true);
    }
  });
});

describe("Copilot hook scripts", () => {
  type ObservedRequest = { path: string; body: Record<string, unknown> };

  async function runHook(
    script: string,
    payload: Record<string, unknown>,
    env: Record<string, string> = {},
  ): Promise<{ requests: ObservedRequest[]; stdout: string }> {
    const requests: ObservedRequest[] = [];
    const server = createServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
      });
      req.on("end", () => {
        requests.push({
          path: req.url ?? "",
          body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ context: "remembered context" }));
      });
    });

    await new Promise<void>((resolveServer) => {
      server.listen(0, "127.0.0.1", resolveServer);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      server.close();
      throw new Error("test server did not bind to a TCP port");
    }

    try {
      const child = spawn(process.execPath, [join(pluginRoot, script)], {
        env: {
          ...process.env,
          AGENTMEMORY_URL: `http://127.0.0.1:${address.port}`,
          AGENTMEMORY_SECRET: "",
          ...env,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.stdin.end(JSON.stringify(payload));

      const exitCode = await new Promise<number | null>((resolveExit, reject) => {
        const timeout = setTimeout(() => {
          child.kill();
          reject(new Error(`hook ${script} timed out`));
        }, 5000);
        child.on("error", reject);
        child.on("close", (code) => {
          clearTimeout(timeout);
          resolveExit(code);
        });
      });

      expect(exitCode, stderr).toBe(0);
      return { requests, stdout };
    } finally {
      await new Promise<void>((resolveClose) => {
        server.close(() => resolveClose());
      });
    }
  }

  it("session-start accepts Copilot camelCase sessionId", async () => {
    const result = await runHook(
      "scripts/session-start.mjs",
      { sessionId: "copilot-session", cwd: "C:\\repo" },
      { AGENTMEMORY_INJECT_CONTEXT: "true" },
    );

    expect(result.stdout).toBe("remembered context");
    expect(result.requests[0]?.path).toBe("/agentmemory/session/start");
    expect(result.requests[0]?.body).toMatchObject({
      sessionId: "copilot-session",
      project: "C:\\repo",
      cwd: "C:\\repo",
    });
  });

  it("pre-tool-use narrows Copilot sessionId to strings", async () => {
    const result = await runHook(
      "scripts/pre-tool-use.mjs",
      {
        sessionId: 123,
        toolName: "read",
        toolArgs: { path: "src/index.ts" },
      },
      { AGENTMEMORY_INJECT_CONTEXT: "true" },
    );

    expect(result.stdout).toBe("remembered context");
    expect(result.requests[0]?.path).toBe("/agentmemory/enrich");
    expect(result.requests[0]?.body).toMatchObject({
      sessionId: "unknown",
      files: ["src/index.ts"],
      terms: [],
      toolName: "read",
    });
  });

  it("prompt-submit accepts Copilot camelCase prompt payload", async () => {
    const result = await runHook("scripts/prompt-submit.mjs", {
      sessionId: "copilot-session",
      cwd: "C:\\repo",
      userPrompt: "remember this prompt",
    });

    expect(result.requests[0]?.path).toBe("/agentmemory/observe");
    expect(result.requests[0]?.body).toMatchObject({
      hookType: "prompt_submit",
      sessionId: "copilot-session",
      data: { prompt: "remember this prompt" },
    });
  });

  it("post-tool-failure accepts Copilot camelCase tool and error payloads", async () => {
    const result = await runHook("scripts/post-tool-failure.mjs", {
      sessionId: "copilot-session",
      cwd: "C:\\repo",
      toolName: "edit",
      toolArgs: { filePath: "src/index.ts" },
      errorMessage: "failed",
    });

    expect(result.requests[0]?.path).toBe("/agentmemory/observe");
    expect(result.requests[0]?.body).toMatchObject({
      hookType: "post_tool_failure",
      sessionId: "copilot-session",
      data: {
        tool_name: "edit",
        tool_input: JSON.stringify({ filePath: "src/index.ts" }),
        error: "failed",
      },
    });
  });

  it("notification accepts Copilot camelCase notificationType", async () => {
    const result = await runHook("scripts/notification.mjs", {
      sessionId: "copilot-session",
      cwd: "C:\\repo",
      notificationType: "permission_prompt",
      title: "Tool approval",
      message: "Approve edit",
    });

    expect(result.requests[0]?.path).toBe("/agentmemory/observe");
    expect(result.requests[0]?.body).toMatchObject({
      hookType: "notification",
      sessionId: "copilot-session",
      data: {
        notification_type: "permission_prompt",
        title: "Tool approval",
        message: "Approve edit",
      },
    });
  });
});
