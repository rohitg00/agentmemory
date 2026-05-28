import { execSync } from "node:child_process";
import { basename } from "node:path";

// Resolution order:
//   AGENTMEMORY_PROJECT_NAME env
//   → canonical remote.origin.url (host/owner/repo, normalized)
//   → git toplevel basename
//   → cwd basename
export function resolveProject(cwd?: string): string {
  const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
  if (explicit && explicit.trim()) return explicit.trim();
  const dir = cwd && cwd.trim() ? cwd : process.cwd();

  const remote = readGitConfig(dir, "remote.origin.url");
  if (remote) {
    const canonical = canonicalizeRemoteUrl(remote);
    if (canonical) return canonical;
  }

  const top = readGitToplevel(dir);
  if (top) return basename(top);

  return basename(dir);
}

function readGitConfig(cwd: string, key: string): string | undefined {
  try {
    const out = execSync(`git config --get ${key}`, {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    })
      .toString()
      .trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

function readGitToplevel(cwd: string): string | undefined {
  try {
    const out = execSync("git rev-parse --show-toplevel", {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    })
      .toString()
      .trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

function canonicalizeRemoteUrl(raw: string): string | undefined {
  const url = raw.trim();
  if (!url) return undefined;

  let host: string | undefined;
  let path: string | undefined;

  // SCP-style SSH: user@host:path  (no scheme)
  const scp = url.match(/^[^@\s/:]+@([^:\s/[\]]+):(.+)$/);
  if (scp && !url.includes("://")) {
    host = scp[1];
    path = scp[2];
  } else {
    try {
      const u = new URL(url);
      host = u.hostname;
      path = u.pathname;
    } catch {
      return undefined;
    }
  }

  if (!host || !path) return undefined;
  path = path
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");
  if (!path) return undefined;
  // Host providers (GitHub, GitLab, Bitbucket) treat owner/repo as
  // case-insensitive; lowercasing the full key prevents same-repo
  // fragmentation when clones differ only in URL case.
  return `${host}/${path}`.toLowerCase();
}
