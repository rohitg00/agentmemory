import { describe, expect, it } from "vitest";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import {
  detectEmbeddingProvider,
  detectLlmProviderKind,
  embeddingOptInHint,
  llmOptInHint,
} from "../src/config.js";
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
});

describe("hook token transport", () => {
  it("refuses to send a secret to a remote http URL", () => {
    const endpoint = resolveHookEndpoint({ AGENTMEMORY_URL: "http://memory.example.com", AGENTMEMORY_SECRET: "s3cret" });
    expect(endpoint.blocked).toBe(true);
    expect(endpoint.secret).toBe("");
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
});

describe("MCP tool annotations", () => {
  it("annotates every tool", () => {
    for (const tool of getAllTools()) {
      expect(tool.annotations, tool.name).toBeDefined();
    }
  });

  it("marks tools that delete or overwrite data as destructive", () => {
    const byName = new Map(getAllTools().map((t) => [t.name, t]));
    for (const name of ["memory_governance_delete", "memory_lesson_delete", "memory_slot_delete", "memory_slot_replace", "memory_heal"]) {
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
