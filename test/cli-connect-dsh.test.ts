import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { adapter } from "../src/cli/connect/dsh.js";
import { writeGuideline, guidelineTargets } from "../src/cli/connect/guidelines.js";

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  isCancel: () => false,
  multiselect: async () => [],
  note: vi.fn(),
  log: {
    step: vi.fn(),
    info: vi.fn(),
    message: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const OPTS = { dryRun: false, force: false, withHooks: false, guidelines: false };

describe("agentmemory connect — dsh adapter", () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "am-dsh-"));
    process.env.DSH_HOME = join(tmpHome, ".dsh");
    delete process.env.AGENTMEMORY_DSH_PROFILE;
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
  });

  function makeProfile() {
    mkdirSync(join(tmpHome, ".dsh", "profiles", "web"), { recursive: true });
    writeFileSync(join(tmpHome, ".dsh", "profiles", "web", "cordis.yml"), "[]\n");
  }

  it("detects dsh home", () => {
    expect(adapter.detect()).toBe(false);
    mkdirSync(join(tmpHome, ".dsh"), { recursive: true });
    expect(adapter.detect()).toBe(true);
  });

  it("appends mcp-agentmemory entry to cordis.patch.yml preserving user content", async () => {
    makeProfile();
    const patch = join(tmpHome, ".dsh", "profiles", "web", "cordis.patch.yml");
    writeFileSync(patch, "# user comment\n- insert:\n    - id: mcp-codegraph\n      name: 'x'\n");
    const result = await adapter.install(OPTS);
    expect(result.kind).toBe("installed");
    const content = readFileSync(patch, "utf8");
    expect(content).toContain("# user comment");
    expect(content).toContain("mcp-codegraph");
    expect(content).toContain("mcp-agentmemory");
    expect(content).toContain("@deepseek-ai/dsh-mcp-client");
    expect(content).toContain("serverName: agentmemory");
    expect(content).toContain("@agentmemory/mcp");
  });

  it("reports already-wired on second run without force", async () => {
    makeProfile();
    await adapter.install(OPTS);
    const second = await adapter.install(OPTS);
    expect(second.kind).toBe("already-wired");
  });

  it("writes the memory-sync skill under ~/.dsh/skills", async () => {
    makeProfile();
    await adapter.install(OPTS);
    const skill = join(tmpHome, ".dsh", "skills", "agentmemory-sync", "SKILL.md");
    expect(existsSync(skill)).toBe(true);
    expect(readFileSync(skill, "utf8")).toContain("name: agentmemory-sync");
  });

  it("--force replaces the previous block instead of duplicating it", async () => {
    makeProfile();
    await adapter.install(OPTS);
    const patch = join(tmpHome, ".dsh", "profiles", "web", "cordis.patch.yml");
    const first = readFileSync(patch, "utf8");
    expect(first.match(/- id: mcp-agentmemory/g)).toHaveLength(1);

    await adapter.install({ ...OPTS, force: true });
    const second = readFileSync(patch, "utf8");
    // exactly one active entry after force-reinstall, and no stale duplicates
    expect(second.match(/- id: mcp-agentmemory/g)).toHaveLength(1);
    expect(second.match(/- id: mcp-agentmemory/g)).not.toBeNull();
  });

  it("preserves user entries after --force replacement", async () => {
    makeProfile();
    const patch = join(tmpHome, ".dsh", "profiles", "web", "cordis.patch.yml");
    writeFileSync(patch, "# user comment\n- insert:\n    - id: mcp-codegraph\n      name: 'x'\n");
    await adapter.install(OPTS);
    await adapter.install({ ...OPTS, force: true });
    const after = readFileSync(patch, "utf8");
    expect(after).toContain("# user comment");
    expect(after).toContain("mcp-codegraph");
    expect(after.match(/- id: mcp-agentmemory/g)).toHaveLength(1);
  });

  it("dry-run does not mutate files", async () => {
    makeProfile();
    const patch = join(tmpHome, ".dsh", "profiles", "web", "cordis.patch.yml");
    const result = await adapter.install({ ...OPTS, dryRun: true });
    expect(result.kind).toBe("installed");
    expect(existsSync(patch)).toBe(false);
  });

  it("returns stub when profile dir is missing", async () => {
    mkdirSync(join(tmpHome, ".dsh"), { recursive: true });
    const result = await adapter.install(OPTS);
    expect(result.kind).toBe("stub");
  });

  it("honors AGENTMEMORY_DSH_PROFILE override", async () => {
    mkdirSync(join(tmpHome, ".dsh", "profiles", "tui"), { recursive: true });
    process.env.AGENTMEMORY_DSH_PROFILE = "tui";
    const result = await adapter.install(OPTS);
    expect(result.kind).toBe("installed");
    expect(existsSync(join(tmpHome, ".dsh", "profiles", "tui", "cordis.patch.yml"))).toBe(true);
  });
});

describe("writeGuideline for dsh", () => {
  it("writes the memory-usage block into ~/.dsh/AGENTS.md", () => {
    const home = mkdtempSync(join(tmpdir(), "am-dsh-guide-"));
    try {
      expect(Object.keys(guidelineTargets(home))).toContain("dsh");
      const result = writeGuideline("dsh", { cwd: "/tmp", home });
      expect(result.kind).toBe("written");
      expect(result.path).toBe(join(home, ".dsh", "AGENTS.md"));
      expect(existsSync(result.path)).toBe(true);
      expect(readFileSync(result.path, "utf8")).toContain("agentmemory:start");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
