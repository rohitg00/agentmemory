import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveWorkspaceIdentity,
  resolveProject,
  resolveProjectKey,
  clearWorkspaceIdentityCache,
  parseRemoteSlug,
} from "../src/hooks/_project.js";

describe("parseRemoteSlug", () => {
  it("parses https GitHub remotes", () => {
    expect(parseRemoteSlug("https://github.com/rohitg00/agentmemory.git")).toBe(
      "github.com-rohitg00-agentmemory",
    );
  });

  it("parses ssh GitHub remotes", () => {
    expect(parseRemoteSlug("git@github.com:rohitg00/agentmemory.git")).toBe(
      "github.com-rohitg00-agentmemory",
    );
  });

  it("parses GitLab nested subgroup remotes", () => {
    expect(parseRemoteSlug("git@gitlab.com:org/subgroup/monolith.git")).toBe(
      "gitlab.com-org-subgroup-monolith",
    );
  });

  it("parses custom ssh URLs with port", () => {
    expect(
      parseRemoteSlug("ssh://git@git.internal.net:2222/team/service.git"),
    ).toBe("git.internal.net-team-service");
  });
});

describe("resolveWorkspaceIdentity", () => {
  let tmpRoot: string;
  let repoDir: string;
  let subDir: string;

  beforeEach(() => {
    clearWorkspaceIdentityCache();
    delete process.env.AGENTMEMORY_PROJECT_NAME;
    tmpRoot = realpathSync(mkdtempSync(join(tmpdir(), "amem-identity-")));
    repoDir = join(tmpRoot, "Monolith");
    subDir = join(repoDir, "packages", "auth");
    mkdirSync(subDir, { recursive: true });
    execFileSync("git", ["init", "--quiet"], { cwd: repoDir, stdio: "ignore" });
  });

  afterEach(() => {
    clearWorkspaceIdentityCache();
    delete process.env.AGENTMEMORY_PROJECT_NAME;
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("resolves origin remote to host-owner-repo slug", () => {
    execFileSync(
      "git",
      ["remote", "add", "origin", "https://github.com/acme/Monolith.git"],
      { cwd: repoDir, stdio: "ignore" },
    );

    const identity = resolveWorkspaceIdentity(repoDir);
    expect(identity.projectKey).toBe("github.com-acme-monolith");
    expect(identity.displayName).toBe("Monolith");
    expect(identity.rootPath).toBe(repoDir);
  });

  it("prioritizes upstream remote over origin", () => {
    execFileSync(
      "git",
      ["remote", "add", "origin", "https://github.com/fork/Monolith.git"],
      { cwd: repoDir, stdio: "ignore" },
    );
    execFileSync(
      "git",
      ["remote", "add", "upstream", "https://github.com/upstream-org/Monolith.git"],
      { cwd: repoDir, stdio: "ignore" },
    );

    const identity = resolveWorkspaceIdentity(repoDir);
    expect(identity.projectKey).toBe("github.com-upstream-org-monolith");
    expect(identity.displayName).toBe("Monolith");
  });

  it("detects monorepo subpath when called from a nested folder", () => {
    execFileSync(
      "git",
      ["remote", "add", "origin", "https://github.com/acme/Monolith.git"],
      { cwd: repoDir, stdio: "ignore" },
    );

    const identity = resolveWorkspaceIdentity(subDir);
    expect(identity.projectKey).toBe("github.com-acme-monolith");
    expect(identity.displayName).toBe("Monolith");
    expect(identity.subpath).toBe("packages/auth");
  });

  it("derives deterministic local slug when no git remote exists", () => {
    const identity1 = resolveWorkspaceIdentity(repoDir);
    expect(identity1.displayName).toBe("Monolith");
    expect(identity1.projectKey).toMatch(/^monolith-[a-f0-9]{8}$/);

    // Another directory with same name has different projectKey
    const otherRepoDir = join(tmpRoot, "other", "Monolith");
    mkdirSync(otherRepoDir, { recursive: true });
    execFileSync("git", ["init", "--quiet"], { cwd: otherRepoDir, stdio: "ignore" });

    const identity2 = resolveWorkspaceIdentity(otherRepoDir);
    expect(identity2.displayName).toBe("Monolith");
    expect(identity2.projectKey).toMatch(/^monolith-[a-f0-9]{8}$/);
    expect(identity2.projectKey).not.toBe(identity1.projectKey);
  });

  it("respects AGENTMEMORY_PROJECT_NAME override", () => {
    process.env.AGENTMEMORY_PROJECT_NAME = "custom-override";
    const identity = resolveWorkspaceIdentity(repoDir);
    expect(identity.projectKey).toBe("custom-override");
    expect(identity.displayName).toBe("custom-override");
    expect(resolveProjectKey(repoDir)).toBe("custom-override");
  });

  it("memoizes resolution in memory for the same directory", () => {
    const id1 = resolveWorkspaceIdentity(repoDir);
    const id2 = resolveWorkspaceIdentity(repoDir);
    expect(id1).toBe(id2);
  });
});
