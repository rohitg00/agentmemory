import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectAdapter } from "../src/cli/connect/types.js";

const log = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  step: vi.fn(),
  message: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock("@clack/prompts", () => ({ log }));

import { mcpOnlyCaptureNotice } from "../src/cli/connect/capture-notice.js";
import { ADAPTERS, runAdapter } from "../src/cli/connect/index.js";

const installed = { kind: "installed" } as const;

describe("mcpOnlyCaptureNotice", () => {
  it("tells MCP-only agents without hook support that the agent must call memory_save", () => {
    const notice = mcpOnlyCaptureNotice({ displayName: "Gemini CLI" }, { withHooks: false }, installed);
    expect(notice).toBe("Gemini CLI: MCP only. Nothing is captured automatically. The agent must call memory_save to store anything.");
    expect(notice).not.toContain("--with-hooks");
  });

  it("does not suggest --with-hooks when the adapter cannot install hooks, even if the flag was passed", () => {
    const notice = mcpOnlyCaptureNotice({ displayName: "Kiro" }, { withHooks: true }, installed);
    expect(notice).toContain("memory_save");
    expect(notice).not.toContain("--with-hooks");
  });

  it("suggests --with-hooks only for adapters that support it", () => {
    const notice = mcpOnlyCaptureNotice({ displayName: "Antigravity", autoCapture: "with-hooks" }, { withHooks: false }, installed);
    expect(notice).toBe("Antigravity: MCP only. Nothing is captured automatically. Rerun with --with-hooks to capture sessions automatically.");
  });

  it("stays quiet once the adapter reports its hooks as installed", () => {
    const withHooks = { kind: "installed", hooks: "installed" } as const;
    expect(mcpOnlyCaptureNotice({ displayName: "Droid", autoCapture: "with-hooks" }, { withHooks: true }, withHooks)).toBeNull();
    expect(mcpOnlyCaptureNotice({ displayName: "Codex CLI", autoCapture: "plugin-or-with-hooks" }, { withHooks: true }, { kind: "already-wired", hooks: "installed" })).toBeNull();
    expect(mcpOnlyCaptureNotice({ displayName: "DSH", autoCapture: "with-hooks" }, { withHooks: false }, withHooks)).toBeNull();
  });

  it("still warns when --with-hooks was passed but the hooks were not installed", () => {
    for (const result of [installed, { kind: "installed", hooks: "skipped" } as const, { kind: "already-wired", hooks: "skipped" } as const]) {
      expect(mcpOnlyCaptureNotice({ displayName: "Droid", autoCapture: "with-hooks" }, { withHooks: true }, result)).toBe(
        "Droid: MCP only. Nothing is captured automatically because the hooks were not installed. Fix the problem reported above, then rerun with --with-hooks.",
      );
      expect(mcpOnlyCaptureNotice({ displayName: "Codex CLI", autoCapture: "plugin-or-with-hooks" }, { withHooks: true }, result)).toBe(
        "Codex CLI: MCP only. The hooks were not installed, so nothing is captured automatically unless the agentmemory plugin is installed. Fix the problem reported above and rerun with --with-hooks, or install the plugin.",
      );
    }
  });

  it("points plugin-based agents at their plugin", () => {
    const plugin = mcpOnlyCaptureNotice({ displayName: "Cursor", autoCapture: "plugin" }, { withHooks: false }, installed);
    expect(plugin).toContain("unless the agentmemory plugin for Cursor is installed");
    expect(plugin).toContain("memory_save");
    expect(plugin).not.toContain("--with-hooks");
    const both = mcpOnlyCaptureNotice({ displayName: "Claude Code", autoCapture: "plugin-or-with-hooks" }, { withHooks: false }, installed);
    expect(both).toContain("Install the plugin, or rerun with --with-hooks.");
  });

  it("stays quiet for built-in capture and for results that did not wire anything", () => {
    expect(mcpOnlyCaptureNotice({ displayName: "Hermes Agent", autoCapture: "built-in" }, { withHooks: false }, installed)).toBeNull();
    expect(mcpOnlyCaptureNotice({ displayName: "Gemini CLI" }, { withHooks: false }, { kind: "skipped", reason: "exception" })).toBeNull();
    expect(mcpOnlyCaptureNotice({ displayName: "OpenHuman" }, { withHooks: false }, { kind: "stub", reason: "manual" })).toBeNull();
    expect(mcpOnlyCaptureNotice({ displayName: "Gemini CLI" }, { withHooks: false }, { kind: "already-wired" })).not.toBeNull();
  });
});

describe("adapter capture modes", () => {
  it("declares how each adapter captures automatically", () => {
    const modes = Object.fromEntries(ADAPTERS.map((a) => [a.name, a.autoCapture ?? "none"]));
    expect(modes).toMatchObject({
      "claude-code": "plugin-or-with-hooks",
      codex: "plugin-or-with-hooks",
      cursor: "plugin",
      "copilot-cli": "plugin",
      opencode: "plugin",
      antigravity: "with-hooks",
      "antigravity-cli": "with-hooks",
      droid: "with-hooks",
      devin: "with-hooks",
      dsh: "with-hooks",
      hermes: "built-in",
      openclaw: "built-in",
      pi: "built-in",
      omp: "built-in",
      "gemini-cli": "none",
      kiro: "none",
      qwen: "none",
      zed: "none",
    });
  });
});

describe("runAdapter capture notice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const fake = (overrides: Partial<ConnectAdapter> = {}): ConnectAdapter => ({
    name: "fake",
    displayName: "Fake Agent",
    detect: () => true,
    install: async () => ({ kind: "installed" }),
    ...overrides,
  });

  it("prints the MCP-only line after a hook-less install", async () => {
    await runAdapter(fake(), { dryRun: true, force: false, guidelines: false });
    expect(log.warn).toHaveBeenCalledWith(
      "Fake Agent: MCP only. Nothing is captured automatically. The agent must call memory_save to store anything.",
    );
  });

  it("does not print it when --with-hooks installed the hooks", async () => {
    await runAdapter(fake({ autoCapture: "with-hooks", install: async () => ({ kind: "installed", hooks: "installed" }) }), { dryRun: true, force: false, withHooks: true, guidelines: false });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("prints it when --with-hooks was passed but the adapter skipped the hooks", async () => {
    await runAdapter(fake({ autoCapture: "with-hooks", install: async () => ({ kind: "already-wired", hooks: "skipped" }) }), { dryRun: true, force: false, withHooks: true, guidelines: false });
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("because the hooks were not installed"));
  });
});
