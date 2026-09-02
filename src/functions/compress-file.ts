import { constants } from "node:fs";
import { lstat, open, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import type { ISdk } from "iii-sdk";
import type { MemoryProvider } from "../types.js";
import type { StateKV } from "../state/kv.js";
import { recordAudit } from "./audit.js";
import { logger } from "../logger.js";

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

export function registerCompressFileFunction(
  sdk: ISdk,
  kv: StateKV,
  provider: MemoryProvider,
): void {
  sdk.registerFunction(
    "mem::compress-file",
    async (data: { filePath: string }) => {
      if (!data?.filePath || typeof data.filePath !== "string") {
        return { success: false, error: "filePath is required" };
      }

      const absolutePath = resolve(data.filePath);
      const lowerPath = absolutePath.toLowerCase();
      if (extname(absolutePath).toLowerCase() !== ".md") {
        return { success: false, error: "filePath must point to a .md file" };
      }
      if (SENSITIVE_PATH_TERMS.some((term) => lowerPath.includes(term))) {
        return { success: false, error: "refusing to process sensitive-looking path" };
      }

      try {
        const stat = await lstat(absolutePath);
        if (stat.isSymbolicLink()) {
          return { success: false, error: "symlinks are not supported" };
        }
      } catch {
        return { success: false, error: "file not found" };
      }

      let original: string;
      try {
        original = await readFile(absolutePath, "utf-8");
      } catch {
        return { success: false, error: "failed to read file" };
      }

      if (!original.trim()) {
        return { success: true, skipped: true, reason: "file is empty" };
      }

      let response: string;
      try {
        response = await provider.summarize(
          COMPRESS_FILE_SYSTEM_PROMPT,
          `Compress this markdown file while preserving structure and code blocks:\n\n${original}`,
        );
      } catch (err) {
        // Surface the provider's message as a structured error. Without this the
        // throw escapes the function and the engine serializes it as the opaque
        // "[object Object]", hiding actionable hints (e.g. the Bedrock provider's
        // model-access / inference-profile guidance).
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("compress-file provider call failed", {
          filePath: absolutePath,
          error: msg,
        });
        return { success: false, error: msg };
      }
      const compressed = stripMarkdownFence(response);
      const validationErrors = validateCompression(original, compressed);
      if (validationErrors.length > 0) {
        return {
          success: false,
          error: "compression validation failed",
          details: validationErrors,
        };
      }

      const backupPath = resolveBackupPath(absolutePath);
      await writeFile(backupPath, original, "utf-8");

      let fd: Awaited<ReturnType<typeof open>> | null = null;
      try {
        fd = await open(
          absolutePath,
          constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
        );
        await fd.writeFile(compressed, "utf-8");
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ELOOP" || code === "EINVAL") {
          return { success: false, error: "symlinks are not supported" };
        }
        return { success: false, error: "failed to write compressed file" };
      } finally {
        await fd?.close().catch(() => {});
      }

      try {
        await recordAudit(kv, "compress", "mem::compress-file", [], {
          filePath: absolutePath,
          backupPath,
          originalChars: original.length,
          compressedChars: compressed.length,
        });
      } catch {}

      return {
        success: true,
        filePath: absolutePath,
        backupPath,
        originalChars: original.length,
        compressedChars: compressed.length,
      };
    },
  );
}
