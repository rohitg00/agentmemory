import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { copyGitCheckout } from "./helpers/git-checkout-fixture.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function repository() {
  const root = mkdtempSync(join(tmpdir(), "am-checkout-fixture-"));
  roots.push(root);
  const source = join(root, "source"), destination = join(root, "copy");
  mkdirSync(source); mkdirSync(destination);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: source, stdio: "pipe" });
  git("init", "--quiet");
  for (const name of ["tracked.txt", "worktree.txt", "deleted.txt", "staged-deleted.txt", "rename-old.txt"]) writeFileSync(join(source, name), "HEAD\n");
  git("add", ".");
  git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture");
  return { source, destination, git };
}
it("copies staged modifications and new files together with current worktree contents", () => {
  const { source, destination, git } = repository();
  writeFileSync(join(source, "tracked.txt"), "INDEX\n");
  writeFileSync(join(source, "staged new.txt"), "NEW\n");
  git("add", "tracked.txt", "staged new.txt");
  writeFileSync(join(source, "worktree.txt"), "WORKTREE\n");
  writeFileSync(join(source, "untracked.txt"), "UNTRACKED\n");
  copyGitCheckout(source, destination);
  expect(readFileSync(join(destination, "tracked.txt"), "utf8")).toBe("INDEX\n");
  expect(readFileSync(join(destination, "staged new.txt"), "utf8")).toBe("NEW\n");
  expect(readFileSync(join(destination, "worktree.txt"), "utf8")).toBe("WORKTREE\n");
  expect(readFileSync(join(destination, "untracked.txt"), "utf8")).toBe("UNTRACKED\n");
});
it("removes staged and unstaged deletions and preserves a staged rename", () => {
  const { source, destination, git } = repository();
  rmSync(join(source, "deleted.txt"));
  git("rm", "--quiet", "staged-deleted.txt");
  git("mv", "rename-old.txt", "renamed.txt");
  expect(() => copyGitCheckout(source, destination)).not.toThrow();
  for (const name of ["deleted.txt", "staged-deleted.txt", "rename-old.txt"]) expect(existsSync(join(destination, name))).toBe(false);
  expect(readFileSync(join(destination, "renamed.txt"), "utf8")).toBe("HEAD\n");
});
