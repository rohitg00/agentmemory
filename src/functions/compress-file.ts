import { constants, type Stats } from "node:fs";
import { homedir } from "node:os";
import { lstat, open, realpath } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
} from "node:path";
import type { ISdk } from "iii-sdk";
import type { MemoryProvider } from "../types.js";
import type { StateKV } from "../state/kv.js";
import { getEnvVar } from "../config.js";
import { recordAudit } from "./audit.js";

const COMPRESS_FILE_ROOTS_ENV = "AGENTMEMORY_COMPRESS_FILE_ROOTS";
const ROOT_DENIED_ERROR = `filePath must be inside an allowed compress-file root; set ${COMPRESS_FILE_ROOTS_ENV} to opt in additional directories`;
const SENSITIVE_PATH_TERMS = [
  "secret",
  "credential",
  "private_key",
  ".env",
  "id_rsa",
  "token",
];

const COMPRESS_FILE_SYSTEM_PROMPT = `You compress markdown while preserving structure.
Rules:
- Keep all headings exactly as-is.
- Keep all URLs exactly as-is.
- Keep all fenced code blocks exactly as-is.
- Do not remove sections; shorten prose under each section.
- Output only markdown, no wrappers or explanations.`;

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function extractUrls(text: string): string[] {
  return Array.from(new Set(text.match(/https?:\/\/[^\s)]+/g) || []));
}

function extractHeadings(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^#{1,6}\s+/.test(line));
}

function extractCodeBlocks(text: string): string[] {
  return text.match(/```[\s\S]*?```/g) || [];
}

function validateCompression(original: string, compressed: string): string[] {
  const errors: string[] = [];

  const originalHeadings = extractHeadings(original);
  const compressedHeadings = extractHeadings(compressed);
  for (const heading of originalHeadings) {
    if (!compressedHeadings.includes(heading)) {
      errors.push(`missing heading: ${heading}`);
    }
  }

  const originalUrls = extractUrls(original).sort();
  const compressedUrls = extractUrls(compressed).sort();
  if (originalUrls.length !== compressedUrls.length) {
    errors.push("url count changed");
  } else {
    for (let i = 0; i < originalUrls.length; i++) {
      if (originalUrls[i] !== compressedUrls[i]) {
        errors.push("url set changed");
        break;
      }
    }
  }

  const originalBlocks = extractCodeBlocks(original);
  const compressedBlocks = extractCodeBlocks(compressed);
  if (originalBlocks.length !== compressedBlocks.length) {
    errors.push("code block count changed");
  } else {
    for (let i = 0; i < originalBlocks.length; i++) {
      if (originalBlocks[i] !== compressedBlocks[i]) {
        errors.push("code block content changed");
        break;
      }
    }
  }

  return errors;
}

function resolveBackupPath(filePath: string): string {
  const base = basename(filePath, extname(filePath));
  const name = base.endsWith(".original")
    ? `${base}.backup`
    : `${base}.original`;
  return join(dirname(filePath), `${name}.md`);
}

type CompressFileOptions = {
  allowedRoots?: string[];
  cwd?: string;
};

type AllowedPathResult =
  | { success: true; canonicalPath: string; roots: string[] }
  | { success: false; error: string };

type RootSet = {
  requested: string[];
  canonical: string[];
};

type ReadFileResult =
  | { success: true; content: string }
  | { success: false; error: string };

type OpenFileHandle = Awaited<ReturnType<typeof open>>;

function parseAllowedRoots(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((root) => root.trim())
    .filter(Boolean);
}

function isUnsafeRoot(root: string): boolean {
  const normalized = resolve(root);
  return normalized === parse(normalized).root || normalized === homedir();
}

function isInsideRoot(candidate: string, root: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
}

function hasSensitivePathTerm(filePath: string): boolean {
  const lowerPath = filePath.toLowerCase();
  return SENSITIVE_PATH_TERMS.some((term) => lowerPath.includes(term));
}

function requestedRoots(options: CompressFileOptions, cwd: string): string[] {
  if (options.allowedRoots !== undefined) return options.allowedRoots;
  const configured = parseAllowedRoots(getEnvVar(COMPRESS_FILE_ROOTS_ENV));
  const defaultRoots = isUnsafeRoot(cwd) ? [] : [cwd];
  return configured.length > 0 ? [...defaultRoots, ...configured] : defaultRoots;
}

async function canonicalAllowedRoots(
  options: CompressFileOptions,
  cwd: string,
): Promise<RootSet> {
  const roots = requestedRoots(options, cwd)
    .map((root) => resolve(cwd, root))
    .filter((root) => !isUnsafeRoot(root));
  const canonicalRoots = await Promise.all(
    roots.map(async (root) => {
      try {
        return await realpath(root);
      } catch {
        return undefined;
      }
    }),
  );
  const canonical = canonicalRoots
    .filter((root): root is string => !!root)
    .filter((root) => !isUnsafeRoot(root));
  return {
    requested: Array.from(new Set(roots)),
    canonical: Array.from(new Set(canonical)),
  };
}

async function assertAllowedPath(
  absolutePath: string,
  options: CompressFileOptions,
  cwd: string,
): Promise<AllowedPathResult> {
  const roots = await canonicalAllowedRoots(options, cwd);
  if (
    roots.requested.length === 0 ||
    roots.canonical.length === 0 ||
    !roots.requested.some((root) => isInsideRoot(absolutePath, root))
  ) {
    return { success: false, error: ROOT_DENIED_ERROR };
  }

  const canonicalPath = await realpath(absolutePath).catch(() => undefined);
  if (!canonicalPath) {
    return { success: false, error: "file not found" };
  }
  if (!roots.canonical.some((root) => isInsideRoot(canonicalPath, root))) {
    return { success: false, error: ROOT_DENIED_ERROR };
  }
  return { success: true, canonicalPath, roots: roots.canonical };
}

function sameFile(expected: Stats, actual: Stats): boolean {
  return expected.dev === actual.dev && expected.ino === actual.ino;
}

function isSymlinkError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code === "ELOOP" || code === "EINVAL";
}

function isUsableFdRealpath(resolvedPath: string, fdPath: string): boolean {
  return (
    resolvedPath !== fdPath &&
    !resolvedPath.startsWith("/proc/self/fd/") &&
    !resolvedPath.startsWith("/dev/fd/")
  );
}

async function realpathOpenedFile(fd: OpenFileHandle): Promise<string | undefined> {
  for (const fdPath of [`/proc/self/fd/${fd.fd}`, `/dev/fd/${fd.fd}`]) {
    const resolvedPath = await realpath(fdPath).catch(() => undefined);
    if (resolvedPath && isUsableFdRealpath(resolvedPath, fdPath)) {
      return resolvedPath;
    }
  }
  return undefined;
}

async function verifyOpenedPath(
  path: string,
  fd: OpenFileHandle,
  openedStat: Stats,
  roots: string[],
  changedError: string,
  expectedCanonicalPath: string,
  rejectSensitivePath = false,
): Promise<{ success: true } | { success: false; error: string }> {
  const pathCanonical = await realpath(path).catch(() => undefined);
  const fdCanonical = await realpathOpenedFile(fd);
  const canonicalPaths = fdCanonical ? [pathCanonical, fdCanonical] : [pathCanonical];

  for (const canonicalPath of canonicalPaths) {
    if (!canonicalPath || !roots.some((root) => isInsideRoot(canonicalPath, root))) {
      return { success: false, error: ROOT_DENIED_ERROR };
    }
    if (canonicalPath !== expectedCanonicalPath) {
      return { success: false, error: changedError };
    }
    if (rejectSensitivePath && hasSensitivePathTerm(canonicalPath)) {
      return { success: false, error: "refusing to process sensitive-looking path" };
    }
  }

  if (!pathCanonical) {
    return { success: false, error: ROOT_DENIED_ERROR };
  }

  const currentStat = await lstat(pathCanonical).catch(() => undefined);
  if (!currentStat || !sameFile(openedStat, currentStat)) {
    return { success: false, error: changedError };
  }
  if (currentStat.isSymbolicLink()) {
    return { success: false, error: "symlinks are not supported" };
  }
  return { success: true };
}

async function readFileNoFollow(
  absolutePath: string,
  expectedStat: Stats,
  roots: string[],
): Promise<ReadFileResult> {
  let fd: Awaited<ReturnType<typeof open>> | null = null;
  try {
    fd = await open(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const openedStat = await fd.stat();
    if (!sameFile(expectedStat, openedStat)) {
      return { success: false, error: "file changed during compression" };
    }
    if (!openedStat.isFile()) {
      return { success: false, error: "filePath must point to a regular file" };
    }
    const verified = await verifyOpenedPath(
      absolutePath,
      fd,
      openedStat,
      roots,
      "file changed during compression",
      absolutePath,
      true,
    );
    if (!verified.success) {
      return { success: false, error: verified.error };
    }
    return { success: true, content: await fd.readFile("utf-8") };
  } catch (err: unknown) {
    if (isSymlinkError(err)) {
      return { success: false, error: "symlinks are not supported" };
    }
    return { success: false, error: "failed to read file" };
  } finally {
    await fd?.close().catch(() => {});
  }
}

async function writeBackupNoFollow(
  backupPath: string,
  original: string,
  roots: string[],
): Promise<{ success: true } | { success: false; error: string }> {
  const parentPath = await realpath(dirname(backupPath)).catch(() => undefined);
  if (!parentPath || !roots.some((root) => isInsideRoot(parentPath, root))) {
    return { success: false, error: ROOT_DENIED_ERROR };
  }

  let expectedBackupStat: Stats | undefined;
  try {
    const backupStat = await lstat(backupPath);
    if (backupStat.isSymbolicLink()) {
      return { success: false, error: "symlinks are not supported" };
    }
    if (!backupStat.isFile()) {
      return { success: false, error: "backup path must point to a regular file" };
    }
    expectedBackupStat = backupStat;
  } catch {}

  let fd: Awaited<ReturnType<typeof open>> | null = null;
  try {
    fd = await open(
      backupPath,
      expectedBackupStat
        ? constants.O_WRONLY | constants.O_NOFOLLOW
        : constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    );
    const openedStat = await fd.stat();
    if (!openedStat.isFile()) {
      return { success: false, error: "backup path must point to a regular file" };
    }
    if (expectedBackupStat && !sameFile(expectedBackupStat, openedStat)) {
      return { success: false, error: "backup file changed during compression" };
    }
    const verified = await verifyOpenedPath(
      backupPath,
      fd,
      openedStat,
      roots,
      "backup file changed during compression",
      backupPath,
    );
    if (!verified.success) {
      return { success: false, error: verified.error };
    }
    if (expectedBackupStat) {
      await fd.truncate(0);
    }
    await fd.writeFile(original, "utf-8");
    return { success: true };
  } catch (err: unknown) {
    if (isSymlinkError(err)) {
      return { success: false, error: "symlinks are not supported" };
    }
    return { success: false, error: "failed to write backup file" };
  } finally {
    await fd?.close().catch(() => {});
  }
}

async function writeCompressedNoFollow(
  absolutePath: string,
  compressed: string,
  expectedStat: Stats,
  roots: string[],
): Promise<{ success: true } | { success: false; error: string }> {
  let fd: Awaited<ReturnType<typeof open>> | null = null;
  try {
    fd = await open(absolutePath, constants.O_WRONLY | constants.O_NOFOLLOW);
    const openedStat = await fd.stat();
    if (!sameFile(expectedStat, openedStat)) {
      return { success: false, error: "file changed during compression" };
    }
    const verified = await verifyOpenedPath(
      absolutePath,
      fd,
      openedStat,
      roots,
      "file changed during compression",
      absolutePath,
      true,
    );
    if (!verified.success) {
      return { success: false, error: verified.error };
    }
    await fd.truncate(0);
    await fd.writeFile(compressed, "utf-8");
    return { success: true };
  } catch (err: unknown) {
    if (isSymlinkError(err)) {
      return { success: false, error: "symlinks are not supported" };
    }
    return { success: false, error: "failed to write compressed file" };
  } finally {
    await fd?.close().catch(() => {});
  }
}

export function registerCompressFileFunction(
  sdk: ISdk,
  kv: StateKV,
  provider: MemoryProvider,
  options: CompressFileOptions = {},
): void {
  sdk.registerFunction(
    "mem::compress-file",
    async (data: { filePath: string }) => {
      if (!data?.filePath || typeof data.filePath !== "string") {
        return { success: false, error: "filePath is required" };
      }

      const cwd = resolve(options.cwd ?? process.cwd());
      const absolutePath = resolve(cwd, data.filePath);
      if (extname(absolutePath).toLowerCase() !== ".md") {
        return { success: false, error: "filePath must point to a .md file" };
      }
      if (hasSensitivePathTerm(absolutePath)) {
        return { success: false, error: "refusing to process sensitive-looking path" };
      }

      const allowed = await assertAllowedPath(absolutePath, options, cwd);
      if (!allowed.success) {
        return { success: false, error: allowed.error };
      }
      if (hasSensitivePathTerm(allowed.canonicalPath)) {
        return { success: false, error: "refusing to process sensitive-looking path" };
      }

      let initialStat: Stats;
      try {
        initialStat = await lstat(absolutePath);
        if (initialStat.isSymbolicLink()) {
          return { success: false, error: "symlinks are not supported" };
        }
        if (!initialStat.isFile()) {
          return { success: false, error: "filePath must point to a regular file" };
        }
      } catch {
        return { success: false, error: "file not found" };
      }

      const readResult = await readFileNoFollow(
        allowed.canonicalPath,
        initialStat,
        allowed.roots,
      );
      if (!readResult.success) {
        return { success: false, error: readResult.error };
      }
      const original = readResult.content;

      if (!original.trim()) {
        return { success: true, skipped: true, reason: "file is empty" };
      }

      const response = await provider.summarize(
        COMPRESS_FILE_SYSTEM_PROMPT,
        `Compress this markdown file while preserving structure and code blocks:\n\n${original}`,
      );
      const compressed = stripMarkdownFence(response);
      const validationErrors = validateCompression(original, compressed);
      if (validationErrors.length > 0) {
        return {
          success: false,
          error: "compression validation failed",
          details: validationErrors,
        };
      }

      const backupPath = resolveBackupPath(allowed.canonicalPath);
      const backupResult = await writeBackupNoFollow(
        backupPath,
        original,
        allowed.roots,
      );
      if (!backupResult.success) {
        return { success: false, error: backupResult.error };
      }

      const writeResult = await writeCompressedNoFollow(
        allowed.canonicalPath,
        compressed,
        initialStat,
        allowed.roots,
      );
      if (!writeResult.success) {
        return { success: false, error: writeResult.error };
      }

      try {
        await recordAudit(kv, "compress", "mem::compress-file", [], {
          filePath: allowed.canonicalPath,
          backupPath,
          originalChars: original.length,
          compressedChars: compressed.length,
        });
      } catch {}

      return {
        success: true,
        filePath: allowed.canonicalPath,
        backupPath,
        originalChars: original.length,
        compressedChars: compressed.length,
      };
    },
  );
}
