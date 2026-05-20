import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
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
      mkdirSync(sub, { recursive: true });
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

  // Maintainer asked for stricter assertion on the same-basename
  // collision case: two distinct ancestor paths with the same leaf
  // directory name MUST both resolve to that shared basename — not
  // just to equal-but-arbitrary strings. This is the property that
  // makes lessons + sessions cross-reference correctly when a user
  // has e.g. ~/work/foo and ~/scratch/foo open in different Codex
  // worktrees.
  it("same-basename collision: distinct paths resolve to the shared basename", () => {
    const root1 = mkdtempSync(join(tmpdir(), "am-proj-collision-a-"));
    const root2 = mkdtempSync(join(tmpdir(), "am-proj-collision-b-"));
    try {
      const sharedName = "shared-leaf-name-9c2f";
      const path1 = join(root1, sharedName);
      const path2 = join(root2, sharedName);
      mkdirSync(path1);
      mkdirSync(path2);
      expect(resolveProject(path1)).toBe(sharedName);
      expect(resolveProject(path2)).toBe(sharedName);
    } finally {
      rmSync(root1, { recursive: true, force: true });
      rmSync(root2, { recursive: true, force: true });
    }
  });

  it("non-string cwd (object, number, null) falls back to process.cwd()", () => {
    const baseline = resolveProject(process.cwd());
    // The resolver typing widened to `unknown` so a runtime guard
    // protects against malformed JSON (data.cwd as {} / 42 / null).
    expect(resolveProject({} as unknown)).toBe(baseline);
    expect(resolveProject(42 as unknown)).toBe(baseline);
    expect(resolveProject(null as unknown)).toBe(baseline);
  });
});
