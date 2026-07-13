import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { normalizeRemote, isRecallCwdAllowed, resolveRecallIdentity } from "../src/recall/identity.js";

describe("recall identity safety and normalization", () => {
  it("normalizes HTTPS, SSH URLs, and SCP remotes to the same repo id input", () => {
    const remotes = [
      "https://github.com/org/repo.git",
      "HTTPS://GITHUB.COM:443/org%2Frepo.git/",
      "ssh://git@github.com:22/org/repo.git",
      "git://github.com:9418/org/repo.git",
      "git@github.com:org/repo.git",
    ];
    expect(new Set(remotes.map(normalizeRemote)).size).toBe(1);
    expect(normalizeRemote("https://github.com/other/repo.git")).not.toBe(normalizeRemote(remotes[0]));
    expect(normalizeRemote("https://gitlab.com/org/repo.git")).not.toBe(normalizeRemote(remotes[0]));
    expect(normalizeRemote("https://github.com/org/other.git")).not.toBe(normalizeRemote(remotes[0]));
    expect(normalizeRemote("ssh://git@gitlab.com:22/org/repo.git")).toBe(normalizeRemote("git@gitlab.com:org/repo.git"));
  });

  it("accepts a real directory under an allowed root and rejects unsafe cwd forms", async () => {
    const root = await mkdtemp(join(process.cwd(), ".recall-identity-root-"));
    const workspace = join(root, "workspace");
    await mkdir(workspace);
    const filePath = join(root, "file.txt");
    await writeFile(filePath, "not a directory");
    try {
      expect(await isRecallCwdAllowed(workspace, [root])).toBe(true);
      expect(await isRecallCwdAllowed(filePath, [root])).toBe(false);
      expect(await isRecallCwdAllowed(join(root, "missing"), [root])).toBe(false);
      expect(await isRecallCwdAllowed("\\\\server\\share", [root])).toBe(false);
      expect(await isRecallCwdAllowed(join(root, "..", "outside"), [root])).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a symlink/junction whose real path escapes the trusted root", async () => {
    const root = await mkdtemp(join(process.cwd(), ".recall-identity-root-"));
    const outside = await mkdtemp(join(tmpdir(), "recall-identity-outside-"));
    const link = join(root, "workspace-link");
    try {
      await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
      expect(await isRecallCwdAllowed(link, [root])).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("degrades invalid cwd to an unknown checkout without probing git", async () => {
    const identity = await resolveRecallIdentity(join(process.cwd(), ".does-not-exist"), "project");
    expect(identity.projectId).toBe("project");
    expect(identity.repoId).toBeUndefined();
    expect(identity.checkoutId).toMatch(/^[0-9a-f]{24}$/);
  });

  it("uses an asynchronous git probe path", async () => {
    const source = await (await import("node:fs/promises")).readFile(
      join(dirname(fileURLToPath(import.meta.url)), "../src/recall/identity.ts"),
      "utf8",
    );
    expect(source).not.toContain("execFileSync");
    expect(source).toContain("execFile");
  });
});
