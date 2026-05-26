import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadClaudeBridgeConfig } from "../src/config.js";

// bridge path must match Claude Code's slug convention exactly:
//   ~/.claude/projects/<slug>/MEMORY.md
// where <slug> replaces every / and \ with - and KEEPS any leading -.
// The previous code stripped the leading - and added a /memory/
// subdirectory; the bridge then wrote a file Claude Code never read.
describe("loadClaudeBridgeConfig path (#625)", () => {
  const ORIG_ENV = { ...process.env };
  beforeEach(() => {
    delete process.env["CLAUDE_MEMORY_BRIDGE"];
    delete process.env["CLAUDE_PROJECT_PATH"];
    delete process.env["CLAUDE_MEMORY_LINE_BUDGET"];
  });
  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  it("preserves leading - on POSIX absolute paths", () => {
    process.env["CLAUDE_MEMORY_BRIDGE"] = "true";
    process.env["CLAUDE_PROJECT_PATH"] = "/home/user/repos/my-project";
    const cfg = loadClaudeBridgeConfig();
    expect(cfg.memoryFilePath).toBe(
      join(homedir(), ".claude", "projects", "-home-user-repos-my-project", "MEMORY.md"),
    );
  });

  it("writes MEMORY.md directly under the slug dir, no memory/ subdir", () => {
    process.env["CLAUDE_MEMORY_BRIDGE"] = "true";
    process.env["CLAUDE_PROJECT_PATH"] = "/Users/x/agentmemory";
    const cfg = loadClaudeBridgeConfig();
    expect(cfg.memoryFilePath).not.toMatch(/[/\\]memory[/\\]MEMORY\.md$/);
    expect(cfg.memoryFilePath).toMatch(/-Users-x-agentmemory[/\\]MEMORY\.md$/);
  });

  it("returns empty memoryFilePath when bridge disabled", () => {
    const cfg = loadClaudeBridgeConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.memoryFilePath).toBe("");
  });

  it("returns empty memoryFilePath when project path unset", () => {
    process.env["CLAUDE_MEMORY_BRIDGE"] = "true";
    const cfg = loadClaudeBridgeConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.memoryFilePath).toBe("");
  });

  it("handles Windows-style backslash paths by swapping to -", () => {
    process.env["CLAUDE_MEMORY_BRIDGE"] = "true";
    process.env["CLAUDE_PROJECT_PATH"] = "C:\\Users\\x\\project";
    const cfg = loadClaudeBridgeConfig();
    expect(cfg.memoryFilePath).toMatch(/C:-Users-x-project[/\\]MEMORY\.md$/);
  });
});
