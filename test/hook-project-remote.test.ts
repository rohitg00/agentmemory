import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProject } from "../src/hooks/_project.js";

function makeRepo(dir: string, remoteUrl?: string) {
  execSync("git init -q -b main", { cwd: dir });
  if (remoteUrl) {
    execSync(`git remote add origin "${remoteUrl}"`, { cwd: dir });
  }
}

describe("resolveProject — canonical remote URL", () => {
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

  function tmpRepo(suffix: string, remoteUrl?: string): string {
    const dir = mkdtempSync(join(tmpdir(), `amem-${suffix}-`));
    scratch.push(dir);
    makeRepo(dir, remoteUrl);
    return dir;
  }

  it("uses canonical remote.origin.url over toplevel basename", () => {
    const dir = tmpRepo("https", "https://github.com/acme/widgets.git");
    expect(resolveProject(dir)).toBe("github.com/acme/widgets");
  });

  it("same remote URL resolves to same key across different clone paths", () => {
    const a = tmpRepo("clone-a", "https://github.com/acme/widgets.git");
    const b = tmpRepo("clone-b", "https://github.com/acme/widgets.git");
    expect(resolveProject(a)).toBe(resolveProject(b));
  });

  it("different remote URLs resolve differently even when toplevel basenames collide", () => {
    const a = mkdtempSync(join(tmpdir(), "amem-collide-utils-"));
    const b = mkdtempSync(join(tmpdir(), "amem-collide-utils-"));
    scratch.push(a, b);
    makeRepo(a, "https://github.com/acme/utils.git");
    makeRepo(b, "https://github.com/other/utils.git");
    expect(resolveProject(a)).not.toBe(resolveProject(b));
  });

  it("normalizes SCP-style SSH remotes (git@host:owner/repo.git)", () => {
    const dir = tmpRepo("scp", "git@github.com:acme/widgets.git");
    expect(resolveProject(dir)).toBe("github.com/acme/widgets");
  });

  it("normalizes ssh:// URLs with user and port", () => {
    const dir = tmpRepo("ssh", "ssh://git@git.example.com:2222/acme/widgets.git");
    expect(resolveProject(dir)).toBe("git.example.com/acme/widgets");
  });

  it("strips embedded credentials from https URLs", () => {
    const dir = tmpRepo("creds", "https://user:token@github.com/acme/widgets.git");
    expect(resolveProject(dir)).toBe("github.com/acme/widgets");
  });

  it("lowercases host and path to absorb URL case differences", () => {
    const dir = tmpRepo("case", "https://GitHub.COM/Acme/Widgets.git");
    expect(resolveProject(dir)).toBe("github.com/acme/widgets");
  });

  it("strips trailing .git suffix", () => {
    const dir = tmpRepo("nogit", "https://github.com/acme/widgets");
    expect(resolveProject(dir)).toBe("github.com/acme/widgets");
  });

  it("AGENTMEMORY_PROJECT_NAME still wins over remote URL", () => {
    process.env.AGENTMEMORY_PROJECT_NAME = "my-override";
    const dir = tmpRepo("envwin", "https://github.com/acme/widgets.git");
    expect(resolveProject(dir)).toBe("my-override");
  });

  it("falls back to toplevel basename when repo has no remote", () => {
    const dir = mkdtempSync(join(tmpdir(), "amem-noremote-myproj-"));
    scratch.push(dir);
    makeRepo(dir);
    expect(resolveProject(dir)).toBe(dir.split("/").pop());
  });

  it("falls back to toplevel basename when remote URL is unparseable", () => {
    const dir = mkdtempSync(join(tmpdir(), "amem-badremote-fallback-"));
    scratch.push(dir);
    makeRepo(dir, "not-a-url");
    expect(resolveProject(dir)).toBe(dir.split("/").pop());
  });

  it("resolves remote URL from a nested subdirectory", () => {
    const dir = tmpRepo("nested", "https://github.com/acme/widgets.git");
    const nested = join(dir, "src", "deep");
    mkdirSync(nested, { recursive: true });
    expect(resolveProject(nested)).toBe("github.com/acme/widgets");
  });
});
