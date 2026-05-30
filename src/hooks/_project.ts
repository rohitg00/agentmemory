import { execSync } from "node:child_process";
import { basename } from "node:path";

function gitToplevelBasename(dir: string): string | null {
  try {
    const top = execSync("git rev-parse --show-toplevel", {
      cwd: dir,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    })
      .toString()
      .trim();
    return top ? basename(top) : null;
  } catch {
    return null;
  }
}

// Normalize any git remote URL to a stable "host/org/repo" identity.
// Handles scp-style SSH (git@host:org/repo.git), ssh://, https://, git://,
// and URLs carrying credentials. Returns null when it can't parse one.
export function normalizeGitRemote(url: string | null | undefined): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;

  let host = "";
  let path = "";

  // scp-style: git@github.com:org/repo.git (no scheme, host and path split by ':')
  const scp = raw.match(/^[^@/]+@([^:/]+):(.+)$/);
  if (scp) {
    host = scp[1];
    path = scp[2];
  } else {
    const schemeStripped = raw.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
    const noCreds = schemeStripped.replace(/^[^@/]*@/, "");
    const slash = noCreds.indexOf("/");
    if (slash === -1) return null;
    host = noCreds.slice(0, slash);
    path = noCreds.slice(slash + 1);
  }

  host = host.toLowerCase().replace(/:\d+$/, ""); // drop optional port
  path = path
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "");

  if (!host || !path) return null;
  return `${host}/${path}`;
}

function gitRemoteIdentity(dir: string): string | null {
  try {
    const url = execSync("git config --get remote.origin.url", {
      cwd: dir,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    })
      .toString()
      .trim();
    return normalizeGitRemote(url);
  } catch {
    return null;
  }
}

function remoteIdentityEnabled(): boolean {
  const flag = process.env["AGENTMEMORY_PROJECT_FROM_REMOTE"];
  return flag === "1" || flag === "true";
}

// Resolution order:
//   AGENTMEMORY_PROJECT_NAME env (explicit override)
//   → git remote identity "host/org/repo" — only when AGENTMEMORY_PROJECT_FROM_REMOTE is set.
//     Stable across machines and differently-named checkouts of the same repo.
//   → git toplevel basename
//   → cwd basename
export function resolveProject(cwd?: string): string {
  const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
  if (explicit && explicit.trim()) return explicit.trim();

  const dir = cwd && cwd.trim() ? cwd : process.cwd();

  if (remoteIdentityEnabled()) {
    const id = gitRemoteIdentity(dir);
    if (id) return id;
  }

  return gitToplevelBasename(dir) ?? basename(dir);
}

export function hookCwd(data: Record<string, unknown> | null | undefined): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  if (typeof data.cwd === "string" && data.cwd.trim()) return data.cwd;
  const roots = data.workspace_roots;
  if (Array.isArray(roots)) {
    for (const root of roots) {
      if (typeof root === "string" && root.trim()) return root;
    }
  }
  const projectDir =
    process.env["DEVIN_PROJECT_DIR"] || process.env["CLAUDE_PROJECT_DIR"];
  if (projectDir && projectDir.trim()) return projectDir;
  return undefined;
}
