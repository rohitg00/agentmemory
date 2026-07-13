import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { delimiter, isAbsolute, relative, resolve } from "node:path";

const ALLOWED_ROOTS_ENV = "AGENTMEMORY_RECALL_ALLOWED_ROOTS";

export interface RecallIdentity {
  projectId: string;
  repoId?: string;
  checkoutId: string;
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function canonicalRemote(host: string, remotePath: string, port?: string, protocol?: string): string {
  const normalizedHost = host.toLowerCase();
  const defaultPort = protocol === "ssh:"
    ? "22"
    : protocol === "git:"
      ? "9418"
      : protocol === "http:"
        ? "80"
        : protocol === "https:"
          ? "443"
          : undefined;
  const normalizedPort = port && !(
    defaultPort !== undefined && port === defaultPort
  )
    ? `:${port}`
    : "";
  const normalizedPath = decodePath(remotePath)
    .split("/")
    .filter(Boolean)
    .join("/")
    .replace(/\.git$/i, "");
  return `${normalizedHost}${normalizedPort}/${normalizedPath}`.toLowerCase();
}

export function normalizeRemote(value: string): string {
  const raw = value.trim();
  if (!raw) return "";

  const scp = raw.match(/^[^@\s/]+@([^:\s/]+):(.+)$/);
  if (scp && !raw.includes("://")) {
    return canonicalRemote(scp[1], scp[2]);
  }

  try {
    const parsed = new URL(raw);
    return canonicalRemote(parsed.hostname, parsed.pathname, parsed.port, parsed.protocol);
  } catch {
    const withoutScheme = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
    const withoutCredentials = withoutScheme.replace(/^[^@/]+@/, "");
    const separator = withoutCredentials.indexOf("/");
    return separator < 0
      ? withoutCredentials.toLowerCase()
      : canonicalRemote(withoutCredentials.slice(0, separator), withoutCredentials.slice(separator + 1));
  }
}

function isUncPath(value: string): boolean {
  return value.startsWith("\\\\") || value.startsWith("//");
}

export function isPathWithinRoot(candidate: string, root: string): boolean {
  const descendant = relative(root, candidate);
  return descendant === "" || (!descendant.startsWith("..") && !isAbsolute(descendant));
}

function configuredAllowedRoots(): string[] {
  const configured = process.env[ALLOWED_ROOTS_ENV]
    ?.split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return configured && configured.length > 0 ? configured : [process.cwd()];
}

async function canonicalDirectory(value: string): Promise<string | undefined> {
  try {
    const canonical = await realpath(value);
    return (await stat(canonical)).isDirectory() ? canonical : undefined;
  } catch {
    return undefined;
  }
}

export async function isRecallCwdAllowed(
  cwd: string,
  allowedRoots: readonly string[] = configuredAllowedRoots(),
): Promise<boolean> {
  const candidateInput = cwd.trim();
  if (!candidateInput || isUncPath(candidateInput)) return false;
  const candidate = await canonicalDirectory(candidateInput);
  if (!candidate) return false;
  const roots = await Promise.all(allowedRoots.map((root) => canonicalDirectory(root)));
  return roots.some((root) => root !== undefined && isPathWithinRoot(candidate, root));
}

function unknownIdentity(projectId: string): RecallIdentity {
  return { projectId, checkoutId: fingerprint("unknown") };
}

function gitValue(cwd: string, args: string[]): Promise<string | undefined> {
  return new Promise((resolveValue) => {
    execFile(
      "git",
      args,
      { cwd, timeout: 500, windowsHide: true, encoding: "utf8" },
      (error, stdout) => {
        if (error) {
          resolveValue(undefined);
          return;
        }
        const value = String(stdout).trim();
        resolveValue(value || undefined);
      },
    );
  });
}

export async function resolveRecallIdentity(
  cwd: string,
  projectId: string,
  allowedRoots?: readonly string[],
): Promise<RecallIdentity> {
  const trustedRoots = allowedRoots ?? configuredAllowedRoots();
  if (!(await isRecallCwdAllowed(cwd, trustedRoots))) return unknownIdentity(projectId);

  const canonicalCwd = await realpath(cwd).catch(() => undefined);
  if (!canonicalCwd) return unknownIdentity(projectId);
  const checkoutRoot = (await gitValue(canonicalCwd, ["rev-parse", "--show-toplevel"])) || canonicalCwd;
  if (!(await isRecallCwdAllowed(checkoutRoot, trustedRoots))) return unknownIdentity(projectId);
  const normalizedRoot = resolve(checkoutRoot).replace(/\\/g, "/").toLowerCase();
  const remote = await gitValue(checkoutRoot, ["remote", "get-url", "origin"]);
  return {
    projectId,
    repoId: remote ? fingerprint(normalizeRemote(remote)) : fingerprint(normalizedRoot),
    checkoutId: fingerprint(normalizedRoot),
  };
}
