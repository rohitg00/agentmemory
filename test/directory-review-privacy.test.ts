import { describe, expect, it, vi } from "vitest";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import {
  detectEmbeddingProvider,
  detectLlmProviderKind,
  embeddingOptInHint,
  envFileLabel,
  llmOptInHint,
  parseEnvContent,
} from "../src/config.js";
import { setLlmProviderInEnv } from "../src/cli/onboarding.js";
import { resolveHookEndpoint, secretTransportAllowed } from "../src/hooks/_endpoint.js";
import { getAllTools, DESTRUCTIVE_TOOLS, READ_ONLY_TOOLS } from "../src/mcp/tools-registry.js";

describe("LLM provider opt-in", () => {
  it("never selects a provider from a key alone", () => {
    for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENROUTER_API_KEY", "MINIMAX_API_KEY"]) {
      expect(detectLlmProviderKind({ [key]: "real-key-value" })).toBe("noop");
    }
  });

  it("selects the provider named by AGENTMEMORY_LLM_PROVIDER when its key is set", () => {
    expect(detectLlmProviderKind({ AGENTMEMORY_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" })).toBe("llm");
    expect(detectLlmProviderKind({ AGENTMEMORY_LLM_PROVIDER: "gemini", GOOGLE_API_KEY: "k" })).toBe("llm");
    expect(detectLlmProviderKind({ AGENTMEMORY_LLM_PROVIDER: "OpenAI", OPENAI_API_KEY: "k" })).toBe("llm");
  });

  it("stays off when the chosen provider has no key or the name is unknown", () => {
    expect(detectLlmProviderKind({ AGENTMEMORY_LLM_PROVIDER: "anthropic", OPENAI_API_KEY: "k" })).toBe("noop");
    expect(detectLlmProviderKind({ AGENTMEMORY_LLM_PROVIDER: "mystery", ANTHROPIC_API_KEY: "k" })).toBe("noop");
    expect(llmOptInHint({ AGENTMEMORY_LLM_PROVIDER: "mystery" })).toContain("not a known provider");
    expect(llmOptInHint({ AGENTMEMORY_LLM_PROVIDER: "anthropic" })).toContain("ANTHROPIC_API_KEY is not");
  });

  it("names the exact line to add when a key is present without a choice", () => {
    expect(llmOptInHint({ ANTHROPIC_API_KEY: "k" })).toContain("AGENTMEMORY_LLM_PROVIDER=anthropic");
    expect(llmOptInHint({})).toBeNull();
    expect(llmOptInHint({ AGENTMEMORY_LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" })).toBeNull();
  });

  it("keeps the agent-sdk path behind its own gate", () => {
    expect(detectLlmProviderKind({ AGENTMEMORY_ALLOW_AGENT_SDK: "true" })).toBe("llm");
  });

  it("gives no opt-in hint while the agent-sdk route is active", () => {
    expect(llmOptInHint({ AGENTMEMORY_ALLOW_AGENT_SDK: "true", ANTHROPIC_API_KEY: "k" })).toBeNull();
  });

  it("points the hints at the env file the daemon reads", () => {
    expect(llmOptInHint({ ANTHROPIC_API_KEY: "k" })).toContain(envFileLabel());
    expect(envFileLabel("/srv/agentmemory/custom.env")).toBe("/srv/agentmemory/custom.env");
    expect(envFileLabel(join(homedir(), ".agentmemory", ".env"))).toBe("~/.agentmemory/.env");
  });
});

describe("embedding provider opt-in", () => {
  it("uses no cloud embedding provider from a key alone", () => {
    for (const key of ["GEMINI_API_KEY", "OPENAI_API_KEY", "OPENAI_EMBEDDING_API_KEY", "VOYAGE_API_KEY", "COHERE_API_KEY", "OPENROUTER_API_KEY"]) {
      expect(detectEmbeddingProvider({ [key]: "k" })).toBeNull();
    }
  });

  it("uses the provider EMBEDDING_PROVIDER names", () => {
    expect(detectEmbeddingProvider({ EMBEDDING_PROVIDER: "voyage", VOYAGE_API_KEY: "k" })).toBe("voyage");
    expect(detectEmbeddingProvider({ EMBEDDING_PROVIDER: "local" })).toBe("local");
  });

  it("explains how to opt in when a cloud key is present", () => {
    expect(embeddingOptInHint({ VOYAGE_API_KEY: "k" })).toContain("EMBEDDING_PROVIDER=voyage");
    expect(embeddingOptInHint({ VOYAGE_API_KEY: "k", EMBEDDING_PROVIDER: "local" })).toBeNull();
    expect(embeddingOptInHint({})).toBeNull();
  });

  it("reports a chosen cloud embedding provider whose key is missing", () => {
    expect(embeddingOptInHint({ EMBEDDING_PROVIDER: "voyage" })).toContain("VOYAGE_API_KEY is not");
    expect(embeddingOptInHint({ EMBEDDING_PROVIDER: "voyage", VOYAGE_API_KEY: "k" })).toBeNull();
    expect(embeddingOptInHint({ EMBEDDING_PROVIDER: "local" })).toBeNull();
  });
});

describe("hook token transport", () => {
  it("refuses to send a secret to a remote http URL", () => {
    const endpoint = resolveHookEndpoint({ AGENTMEMORY_URL: "http://memory.example.com", AGENTMEMORY_SECRET: "s3cret" });
    expect(endpoint.blocked).toBe(true);
    expect(endpoint.secret).toBe("");
  });

  it("sends nothing to a remote http URL even without a secret", () => {
    expect(resolveHookEndpoint({ AGENTMEMORY_URL: "http://memory.example.com", AGENTMEMORY_SECRET: "" }).blocked).toBe(true);
    expect(resolveHookEndpoint({ AGENTMEMORY_URL: "http://127.0.0.1:3111", AGENTMEMORY_SECRET: "" }).blocked).toBe(false);
  });

  it("does not spool a capture it refused to send over remote http", async () => {
    const spool = mkdtempSync(join(tmpdir(), "am-spool-"));
    const saved = { url: process.env["AGENTMEMORY_URL"], dir: process.env["AGENTMEMORY_CAPTURE_SPOOL_DIR"] };
    process.env["AGENTMEMORY_URL"] = "http://memory.example.com";
    process.env["AGENTMEMORY_CAPTURE_SPOOL_DIR"] = spool;
    try {
      vi.resetModules();
      const { captureObservation } = await import("../src/hooks/_capture.js");
      const outcome = await captureObservation(
        { hookType: "post_tool_use", sessionId: "s1", project: "p", cwd: "/tmp", timestamp: new Date().toISOString(), data: { secret: "body" } } as never,
        1000,
      );
      expect(outcome).toBe("dropped");
      expect(readdirSync(spool)).toEqual([]);
    } finally {
      if (saved.url === undefined) delete process.env["AGENTMEMORY_URL"]; else process.env["AGENTMEMORY_URL"] = saved.url;
      if (saved.dir === undefined) delete process.env["AGENTMEMORY_CAPTURE_SPOOL_DIR"]; else process.env["AGENTMEMORY_CAPTURE_SPOOL_DIR"] = saved.dir;
      vi.resetModules();
    }
  });

  it("allows https and loopback URLs", () => {
    expect(secretTransportAllowed("https://memory.example.com")).toBe(true);
    expect(secretTransportAllowed("http://127.0.0.1:3111")).toBe(true);
    expect(secretTransportAllowed("http://localhost:3111")).toBe(true);
    expect(secretTransportAllowed("http://memory.example.com")).toBe(false);
    const endpoint = resolveHookEndpoint({ AGENTMEMORY_URL: "https://memory.example.com", AGENTMEMORY_SECRET: "s3cret" });
    expect(endpoint).toEqual({ url: "https://memory.example.com", secret: "s3cret", blocked: false });
  });

  it("prefers the Claude Code plugin options over the inherited environment", () => {
    const endpoint = resolveHookEndpoint({
      AGENTMEMORY_URL: "https://inherited.example.com",
      AGENTMEMORY_SECRET: "inherited",
      CLAUDE_PLUGIN_OPTION_AGENTMEMORY_URL: "https://chosen.example.com",
      CLAUDE_PLUGIN_OPTION_AGENTMEMORY_SECRET: "chosen",
    });
    expect(endpoint).toEqual({ url: "https://chosen.example.com", secret: "chosen", blocked: false });
  });

  it("does not fall back to an inherited secret when the plugin option is empty", () => {
    const endpoint = resolveHookEndpoint({
      AGENTMEMORY_SECRET: "inherited",
      CLAUDE_PLUGIN_OPTION_AGENTMEMORY_URL: "https://chosen.example.com",
      CLAUDE_PLUGIN_OPTION_AGENTMEMORY_SECRET: "",
    });
    expect(endpoint.secret).toBe("");
  });

  it("keeps a custom AGENTMEMORY_URL when the plugin URL option is empty", () => {
    const endpoint = resolveHookEndpoint({
      AGENTMEMORY_URL: "http://127.0.0.1:3311",
      CLAUDE_PLUGIN_OPTION_AGENTMEMORY_URL: "",
      CLAUDE_PLUGIN_OPTION_AGENTMEMORY_SECRET: "",
    });
    expect(endpoint.url).toBe("http://127.0.0.1:3311");
  });

  it("uses the local default when neither the option nor the environment names a URL", () => {
    expect(resolveHookEndpoint({ CLAUDE_PLUGIN_OPTION_AGENTMEMORY_URL: "" }).url).toBe("http://localhost:3111");
  });
});

describe("onboarding provider choice", () => {
  it("leaves exactly one AGENTMEMORY_LLM_PROVIDER line", () => {
    const dir = mkdtempSync(join(tmpdir(), "am-onboard-"));
    const envPath = join(dir, ".env");
    writeFileSync(envPath, "AGENTMEMORY_LLM_PROVIDER=openai\nANTHROPIC_API_KEY=k\nAGENTMEMORY_LLM_PROVIDER=gemini\n");
    expect(setLlmProviderInEnv(envPath, "anthropic")).toBe(true);
    const content = readFileSync(envPath, "utf-8");
    expect(content.match(/AGENTMEMORY_LLM_PROVIDER=/g)).toHaveLength(1);
    expect(parseEnvContent(content)["AGENTMEMORY_LLM_PROVIDER"]).toBe("anthropic");
    expect(parseEnvContent(content)["ANTHROPIC_API_KEY"]).toBe("k");
  });

  it("removes the provider from the file and this process on Skip", () => {
    const dir = mkdtempSync(join(tmpdir(), "am-onboard-"));
    const envPath = join(dir, ".env");
    writeFileSync(envPath, "AGENTMEMORY_LLM_PROVIDER=openai\nOPENAI_API_KEY=k\n");
    const previous = process.env["AGENTMEMORY_LLM_PROVIDER"];
    process.env["AGENTMEMORY_LLM_PROVIDER"] = "openai";
    try {
      expect(setLlmProviderInEnv(envPath, null)).toBe(true);
      expect(process.env["AGENTMEMORY_LLM_PROVIDER"]).toBeUndefined();
      const content = readFileSync(envPath, "utf-8");
      expect(content).not.toContain("AGENTMEMORY_LLM_PROVIDER");
      expect(parseEnvContent(content)["OPENAI_API_KEY"]).toBe("k");
    } finally {
      if (previous === undefined) delete process.env["AGENTMEMORY_LLM_PROVIDER"];
      else process.env["AGENTMEMORY_LLM_PROVIDER"] = previous;
    }
  });
});

describe("MCP tool annotations", () => {
  it("annotates every tool", () => {
    for (const tool of getAllTools()) {
      expect(tool.annotations, tool.name).toBeDefined();
    }
  });

  it("marks tools that delete or overwrite data as destructive", () => {
    const byName = new Map(getAllTools().map((t) => [t.name, t]));
    expect(READ_ONLY_TOOLS.has("memory_profile")).toBe(false);
    expect(byName.get("memory_profile")?.annotations).toMatchObject({ readOnlyHint: false });
    for (const name of ["memory_governance_delete", "memory_lesson_delete", "memory_slot_delete", "memory_slot_replace", "memory_heal", "memory_action_update"]) {
      expect(DESTRUCTIVE_TOOLS.has(name)).toBe(true);
      expect(byName.get(name)?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    }
    expect(byName.get("memory_save")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    for (const name of ["memory_recall", "memory_smart_search", "memory_lesson_recall"]) {
      expect(READ_ONLY_TOOLS.has(name)).toBe(true);
      expect(byName.get(name)?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    }
  });

  it("only classifies tools that exist", () => {
    const names = new Set(getAllTools().map((t) => t.name));
    for (const name of [...READ_ONLY_TOOLS, ...DESTRUCTIVE_TOOLS]) expect(names.has(name), name).toBe(true);
  });
});

const preCompactScript = join(resolve(__dirname, ".."), "plugin", "scripts", "pre-compact.mjs");

async function runPreCompact(env: Record<string, string>): Promise<{ stdout: string; paths: string[] }> {
  const paths: string[] = [];
  const server = createServer((req, res) => {
    paths.push(req.url ?? "");
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ context: "<agentmemory-context>stored memory</agentmemory-context>" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  const baseEnv: Record<string, string | undefined> = { ...process.env };
  for (const k of ["AGENTMEMORY_INJECT_CONTEXT", "CLAUDE_MEMORY_BRIDGE", "AGENTMEMORY_PRE_COMPACT_BUDGET"]) delete baseEnv[k];
  try {
    const child = spawn(process.execPath, [preCompactScript], {
      env: { ...baseEnv, AGENTMEMORY_URL: `http://127.0.0.1:${address.port}`, AGENTMEMORY_SECRET: "", ...env },
      stdio: ["pipe", "pipe", "ignore"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stdin.end(JSON.stringify({ session_id: "s1", cwd: "/tmp" }));
    await new Promise<void>((done, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("pre-compact timed out"));
      }, 8000);
      child.on("error", reject);
      child.on("close", () => {
        clearTimeout(timeout);
        done();
      });
    });
    return { stdout, paths };
  } finally {
    server.close();
  }
}

describe("PreCompact hook", () => {
  it("prints no stored memory by default", async () => {
    const result = await runPreCompact({});
    expect(result.stdout).toBe("");
    expect(result.paths).not.toContain("/agentmemory/context");
  });

  it("prints stored memory when AGENTMEMORY_INJECT_CONTEXT=true", async () => {
    const result = await runPreCompact({ AGENTMEMORY_INJECT_CONTEXT: "true" });
    expect(result.stdout).toContain("stored memory");
  });
});
