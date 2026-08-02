import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeGuideline, guidelineTargets } from "../src/cli/connect/guidelines.js";

let home: string;
let cwd: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "am-guide-home-"));
  cwd = mkdtempSync(join(tmpdir(), "am-guide-cwd-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

describe("writeGuideline", () => {
  it("writes a Cursor .mdc project rule with alwaysApply frontmatter", () => {
    const r = writeGuideline("cursor", { cwd, home });
    expect(r.kind).toBe("written");
    const path = join(cwd, ".cursor", "rules", "agentmemory.mdc");
    expect(existsSync(path)).toBe(true);
    const body = readFileSync(path, "utf8");
    expect(body).toContain("alwaysApply: true");
    expect(body).toContain("memory_recall");
    expect(body).toContain("memory_save");
  });

  it("writes a Kiro steering file with inclusion: always (global)", () => {
    const r = writeGuideline("kiro", { cwd, home });
    expect(r.kind).toBe("written");
    if (r.kind === "written") expect(r.scope).toBe("global");
    const path = join(home, ".kiro", "steering", "agentmemory.md");
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("inclusion: always");
  });

  it("writes a marked block into the agent's global AGENTS.md (Zed)", () => {
    const r = writeGuideline("zed", { cwd, home });
    expect(r.kind).toBe("written");
    const path = join(home, ".config", "zed", "AGENTS.md");
    const body = readFileSync(path, "utf8");
    expect(body).toContain("<!-- agentmemory:start -->");
    expect(body).toContain("<!-- agentmemory:end -->");
  });

  it("prefers the global path when the target defines one (Droid)", () => {
    const r = writeGuideline("droid", { cwd, home });
    expect(r.kind).toBe("written");
    expect(existsSync(join(home, ".factory", "AGENTS.md"))).toBe(true);
    // must NOT have written into the project cwd
    expect(existsSync(join(cwd, "AGENTS.md"))).toBe(false);
  });

  it("falls back to a project path when the agent has no global rules file (Warp)", () => {
    const r = writeGuideline("warp", { cwd, home });
    expect(r.kind).toBe("written");
    if (r.kind === "written") expect(r.scope).toBe("project");
    expect(existsSync(join(cwd, "AGENTS.md"))).toBe(true);
  });

  it("preserves surrounding user content and updates only its own block", () => {
    const path = join(home, ".factory", "AGENTS.md");
    mkdirSync(join(home, ".factory"), { recursive: true });
    writeFileSync(path, "# My rules\n\nUse tabs, not spaces.\n", "utf8");

    writeGuideline("droid", { cwd, home });
    const first = readFileSync(path, "utf8");
    expect(first).toContain("# My rules");
    expect(first).toContain("Use tabs, not spaces.");
    expect(first).toContain("<!-- agentmemory:start -->");

    // Re-running is idempotent (no duplicate block, reports unchanged).
    const again = writeGuideline("droid", { cwd, home });
    expect(again.kind).toBe("unchanged");
    const second = readFileSync(path, "utf8");
    expect(second).toBe(first);
    expect(second.match(/agentmemory:start/g)?.length).toBe(1);
  });

  it("refuses to touch a file with a lone or reversed marker", () => {
    const path = join(home, ".factory", "AGENTS.md");
    mkdirSync(join(home, ".factory"), { recursive: true });
    // Lone START marker: appending would let a later run pair this orphan
    // with the appended block's END and cut the user's content in between.
    const lone = "# Rules\n<!-- agentmemory:start -->\nuser notes here\n";
    writeFileSync(path, lone, "utf8");
    const r = writeGuideline("droid", { cwd, home });
    expect(r.kind).toBe("unchanged");
    expect(readFileSync(path, "utf8")).toBe(lone);

    // Reversed pair: same refusal.
    const reversed =
      "<!-- agentmemory:end -->\nmiddle\n<!-- agentmemory:start -->\n";
    writeFileSync(path, reversed, "utf8");
    const r2 = writeGuideline("droid", { cwd, home });
    expect(r2.kind).toBe("unchanged");
    expect(readFileSync(path, "utf8")).toBe(reversed);
  });

  it("is idempotent for dedicated files (second run unchanged)", () => {
    expect(writeGuideline("cursor", { cwd, home }).kind).toBe("written");
    expect(writeGuideline("cursor", { cwd, home }).kind).toBe("unchanged");
  });

  it("dry-run reports would-write without creating the file", () => {
    const r = writeGuideline("kiro", { cwd, home, dryRun: true });
    expect(r.kind).toBe("would-write");
    expect(existsSync(join(home, ".kiro", "steering", "agentmemory.md"))).toBe(false);
  });

  it("returns no-target for agents that already auto-capture (claude-code)", () => {
    expect(writeGuideline("claude-code", { cwd, home }).kind).toBe("no-target");
    expect(writeGuideline("codex", { cwd, home }).kind).toBe("no-target");
  });

  it("Gemini and Antigravity share ~/.gemini/GEMINI.md idempotently", () => {
    writeGuideline("gemini-cli", { cwd, home });
    const r2 = writeGuideline("antigravity", { cwd, home });
    // Antigravity targets the same GEMINI.md; the block already exists.
    expect(r2.kind).toBe("unchanged");
    const body = readFileSync(join(home, ".gemini", "GEMINI.md"), "utf8");
    expect(body.match(/agentmemory:start/g)?.length).toBe(1);
  });
});

describe("guidelineTargets coverage", () => {
  it("covers every MCP-only / partial agent and no others", () => {
    const names = Object.keys(guidelineTargets("/home/x")).sort();
    expect(names).toEqual(
      [
        "antigravity",
        "cline",
        "continue",
        "copilot-cli",
        "cursor",
        "droid",
        "gemini-cli",
        "kiro",
        "opencode",
        "qwen",
        "warp",
        "zed",
      ].sort(),
    );
  });

  it("every target cites an official source URL", () => {
    for (const t of Object.values(guidelineTargets("/home/x"))) {
      expect(t.source).toMatch(/^https:\/\//);
    }
  });
});
