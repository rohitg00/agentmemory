import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export interface RecallIdentity {
  projectId: string;
  repoId?: string;
  checkoutId: string;
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function normalizeRemote(value: string): string {
  const trimmed = value
    .trim()
    .replace(/^[a-z]+:\/\/[^@/]+@/i, (prefix) => prefix.replace(/\/\/[^@/]+@/, "//"))
    .replace(/\.git$/i, "")
    .replace(/\/$/, "");
  const ssh = trimmed.match(/^[^@\s]+@([^:]+):(.+)$/);
  return (ssh ? `${ssh[1]}/${ssh[2]}` : trimmed).toLowerCase();
}

function gitValue(cwd: string, args: string[]): string | undefined {
  try {
    const value = execFileSync("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    }).toString().trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

export function resolveRecallIdentity(
  cwd: string,
  projectId: string,
): RecallIdentity {
  const checkoutRoot = gitValue(cwd, ["rev-parse", "--show-toplevel"]) || cwd;
  const normalizedRoot = resolve(checkoutRoot).replace(/\\/g, "/").toLowerCase();
  const remote = gitValue(checkoutRoot, ["remote", "get-url", "origin"]);
  return {
    projectId,
    repoId: remote ? fingerprint(normalizeRemote(remote)) : fingerprint(normalizedRoot),
    checkoutId: fingerprint(normalizedRoot),
  };
}
