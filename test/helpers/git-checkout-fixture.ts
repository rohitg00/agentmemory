import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

export function copyGitCheckout(source: string, destination: string): void {
  const archive = execFileSync("git", ["archive", "--format=tar", "HEAD"], { cwd: source, maxBuffer: 128 * 1024 * 1024 });
  execFileSync("tar", ["-xf", "-", "-C", destination], { input: archive });
  const changed = execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", "HEAD", "--"], { cwd: source, encoding: "utf8" });
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: source, encoding: "utf8" });
  for (const path of new Set((changed + untracked).split("\0").filter(Boolean))) {
    const current = join(source, path), target = join(destination, path);
    if (existsSync(current)) {
      mkdirSync(dirname(target), { recursive: true });
      cpSync(current, target, { recursive: true });
    } else rmSync(target, { recursive: true, force: true });
  }
}
