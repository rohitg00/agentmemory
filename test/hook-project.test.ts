import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProject } from "../src/hooks/_project.js";

describe("resolveProject — hook project resolver", () => {
  const originalEnv = process.env.AGENTMEMORY_PROJECT_NAME;
  const scratch: string[] = [];

  beforeEach(() => {
    delete process.env.AGENTMEMORY_PROJECT_NAME;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AGENTMEMORY_PROJECT_NAME;
    } else {
      process.env.AGENTMEMORY_PROJECT_NAME = originalEnv;
    }
    while (scratch.length) {
      const d = scratch.pop()!;
      rmSync(d, { recursive: true, force: true });
    }
  });

  function tmpGitRepoNoRemote(suffix: string): string {
    const dir = mkdtempSync(join(tmpdir(), `amem-${suffix}-`));
    scratch.push(dir);
    execSync("git init -q -b main", { cwd: dir });
    return dir;
  }

  it("AGENTMEMORY_PROJECT_NAME env wins over everything", () => {
    process.env.AGENTMEMORY_PROJECT_NAME = "my-override";
    expect(resolveProject("/var/log")).toBe("my-override");
    expect(resolveProject(process.cwd())).toBe("my-override");
  });

  it("trims whitespace on env override", () => {
    process.env.AGENTMEMORY_PROJECT_NAME = "  spaced  ";
    expect(resolveProject("/var/log")).toBe("spaced");
  });

  it("ignores empty env override", () => {
    process.env.AGENTMEMORY_PROJECT_NAME = "   ";
    const dir = tmpGitRepoNoRemote("emptyenv-projx");
    expect(resolveProject(dir)).toBe(dir.split("/").pop());
  });

  it("returns git toplevel basename when repo has no remote", () => {
    const dir = tmpGitRepoNoRemote("noremote");
    expect(resolveProject(dir)).toBe(dir.split("/").pop());
  });

  it("returns git toplevel basename from a nested subdir when no remote", () => {
    const dir = tmpGitRepoNoRemote("nested-noremote");
    const nested = join(dir, "src", "hooks");
    mkdirSync(nested, { recursive: true });
    expect(resolveProject(nested)).toBe(dir.split("/").pop());
  });

  it("falls back to basename(cwd) when not in a git repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "amem-noproj-"));
    scratch.push(dir);
    expect(resolveProject(dir)).toBe(dir.split("/").pop());
  });

  it("defaults to process.cwd() when no cwd argument given", () => {
    // process.cwd() is the agentmemory checkout; whether it has a remote
    // depends on environment, but the resolved key must end in /agentmemory
    // (canonical URL) or equal "agentmemory" (no-remote fallback).
    const result = resolveProject();
    expect(result === "agentmemory" || result.endsWith("/agentmemory")).toBe(true);
  });

  it("defaults to process.cwd() when cwd argument is empty", () => {
    const a = resolveProject("");
    const b = resolveProject("   ");
    expect(a === "agentmemory" || a.endsWith("/agentmemory")).toBe(true);
    expect(b).toBe(a);
  });
});
