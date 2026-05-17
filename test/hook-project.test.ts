import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";

import { resolveProject } from "../src/hooks/_project.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.AGENTMEMORY_PROJECT_NAME;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("resolveProject (#lesson-visibility-pt2)", () => {
  it("returns AGENTMEMORY_PROJECT_NAME verbatim when set", () => {
    process.env.AGENTMEMORY_PROJECT_NAME = "explicit-name";
    expect(resolveProject("/wherever/this/is")).toBe("explicit-name");
  });

  it("trims AGENTMEMORY_PROJECT_NAME whitespace", () => {
    process.env.AGENTMEMORY_PROJECT_NAME = "  padded  ";
    expect(resolveProject()).toBe("padded");
  });

  it("treats empty AGENTMEMORY_PROJECT_NAME as unset (falls through)", () => {
    process.env.AGENTMEMORY_PROJECT_NAME = "   ";
    const tmp = mkdtempSync(join(tmpdir(), "am-proj-"));
    try {
      expect(resolveProject(tmp)).toBe(basename(tmp));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("returns basename of git toplevel when inside a git repo", () => {
    const tmp = mkdtempSync(join(tmpdir(), "am-proj-"));
    try {
      execSync("git init --quiet", { cwd: tmp });
      const sub = join(tmp, "src", "deep");
      execSync(`mkdir -p ${sub}`);
      // When called from a subdirectory of the repo, project is still the
      // repo basename, not the subdirectory basename. This handles sessions
      // started inside subtrees (e.g. /repo/src/foo).
      expect(resolveProject(sub)).toBe(basename(tmp));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("falls back to basename(cwd) when not in a git repo", () => {
    const tmp = mkdtempSync(join(tmpdir(), "am-proj-not-git-"));
    try {
      // No git init. Should not throw; should return basename of the dir.
      expect(resolveProject(tmp)).toBe(basename(tmp));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("uses process.cwd() when no cwd argument is given", () => {
    // Smoke-only: just ensure it returns a non-empty string.
    const v = resolveProject();
    expect(typeof v).toBe("string");
    expect(v.length).toBeGreaterThan(0);
  });
});
