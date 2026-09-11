import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { basename, relative, resolve } from "node:path";

export interface WorkspaceIdentity {
  projectKey: string;
  displayName: string;
  rootPath: string;
  subpath?: string;
}

const identityCache = new Map<string, WorkspaceIdentity>();

export function clearWorkspaceIdentityCache(): void {
  identityCache.clear();
}

export function parseRemoteSlug(url: string): string {
  let cleaned = url.trim();
  if (cleaned.endsWith(".git")) {
    cleaned = cleaned.slice(0, -4);
  }
  // Strip protocol
  cleaned = cleaned.replace(/^(https?|git|ssh):\/\//, "");
  // Strip user (e.g. git@github.com)
  if (cleaned.includes("@")) {
    cleaned = cleaned.split("@")[1];
  }
  // Strip port in host (e.g. git.internal.net:2222/team/service)
  cleaned = cleaned.replace(/^([^/:]+):\d+\//, "$1/");
  // Replace remaining colons with slash
  cleaned = cleaned.replace(/:/g, "/");

  const segments = cleaned
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length === 0) return "unknown";

  const host = segments[0].toLowerCase();
  const rest = segments.slice(1).join("-").toLowerCase();

  const combined = rest ? `${host}-${rest}` : host;
  return combined.replace(/[^a-z0-9.-]/gi, "-").replace(/-+/g, "-");
}

export function resolveWorkspaceIdentity(cwd?: string): WorkspaceIdentity {
  const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
  const rawDir = cwd && cwd.trim() ? resolve(cwd.trim()) : process.cwd();

  if (explicit && explicit.trim()) {
    const name = explicit.trim();
    return {
      projectKey: name,
      displayName: name,
      rootPath: rawDir,
    };
  }

  let dir = rawDir;
  try {
    dir = realpathSync(rawDir);
  } catch {}

  const cached = identityCache.get(dir);
  if (cached) return cached;

  let rootPath = dir;
  let displayName = basename(dir);
  let subpath: string | undefined;
  let remoteUrl: string | undefined;

  try {
    const top = execSync("git rev-parse --show-toplevel", {
      cwd: dir,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 500,
    })
      .toString()
      .trim();

    if (top) {
      let resolvedTop = top;
      try {
        resolvedTop = realpathSync(top);
      } catch {}

      rootPath = resolvedTop;
      displayName = basename(resolvedTop);

      if (dir !== resolvedTop) {
        const rel = relative(resolvedTop, dir).replace(/\\/g, "/");
        if (rel && rel !== ".") {
          subpath = rel;
        }
      }

      // Priority: upstream then origin
      try {
        remoteUrl = execSync("git config --get remote.upstream.url", {
          cwd: dir,
          stdio: ["ignore", "pipe", "ignore"],
          timeout: 500,
        })
          .toString()
          .trim();
      } catch {}

      if (!remoteUrl) {
        try {
          remoteUrl = execSync("git config --get remote.origin.url", {
            cwd: dir,
            stdio: ["ignore", "pipe", "ignore"],
            timeout: 500,
          })
            .toString()
            .trim();
        } catch {}
      }
    }
  } catch {}

  let projectKey: string;
  if (remoteUrl) {
    projectKey = parseRemoteSlug(remoteUrl);
  } else {
    const hash = createHash("sha256").update(rootPath).digest("hex").slice(0, 8);
    projectKey = `${displayName.toLowerCase()}-${hash}`;
  }

  const identity: WorkspaceIdentity = {
    projectKey,
    displayName,
    rootPath,
    subpath,
  };

  identityCache.set(dir, identity);
  identityCache.set(rawDir, identity);
  return identity;
}

// Legacy helper: returns display basename, preserving backward compatibility with legacy tests.
export function resolveProject(cwd?: string): string {
  const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
  if (explicit && explicit.trim()) return explicit.trim();
  return resolveWorkspaceIdentity(cwd).displayName;
}

export function resolveProjectKey(cwd?: string): string {
  const explicit = process.env["AGENTMEMORY_PROJECT_NAME"];
  if (explicit && explicit.trim()) return explicit.trim();
  return resolveWorkspaceIdentity(cwd).projectKey;
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
