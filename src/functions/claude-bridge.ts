import type { IIIClient } from "iii-sdk";
import {
  closeSync, constants, existsSync, fstatSync, linkSync, lstatSync,
  mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { Memory, ClaudeBridgeConfig } from "../types.js";
import { KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { recordAudit } from "./audit.js";
import { logger } from "../logger.js";
import { resolveProject } from "../hooks/_project.js";

function hasIdenticalContent(path: string, content: string): boolean {
  let fd: number | undefined;
  try {
    if (!lstatSync(path).isFile()) return false;
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = fstatSync(fd);
    if (!opened.isFile()) return false;
    const identical = readFileSync(fd, "utf-8") === content;
    const current = lstatSync(path);
    return identical && current.isFile() && current.dev === opened.dev && current.ino === opened.ino;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function publishMemoryFile(path: string, content: string): "created" | "unchanged" {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const temporaryPath = join(dir, `.agentmemory-${randomUUID()}.tmp`);
  const fd = openSync(temporaryPath, "wx", 0o600);
  try {
    try {
      writeFileSync(fd, content, "utf-8");
    } finally {
      closeSync(fd);
    }
    try {
      // Publishing a complete inode with link never replaces a file created
      // or edited by another process while the bridge was loading state.
      linkSync(temporaryPath, path);
      return "created";
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      if (hasIdenticalContent(path, content)) return "unchanged";
      throw new Error(
        `Refusing to replace existing Claude memory file "${path}". ` +
        "Existing files, including generated files, are preserved. Move or remove it deliberately before regenerating.",
      );
    }
  } finally {
    unlinkSync(temporaryPath);
  }
}

function parseMemoryMd(content: string): {
  sections: Map<string, string>;
  raw: string;
} {
  const sections = new Map<string, string>();
  let currentSection = "";
  let currentContent: string[] = [];

  for (const line of content.split("\n")) {
    if (line.startsWith("## ")) {
      if (currentSection) {
        sections.set(currentSection, currentContent.join("\n").trim());
      }
      currentSection = line.slice(3).trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  if (currentSection) {
    sections.set(currentSection, currentContent.join("\n").trim());
  }

  return { sections, raw: content };
}

function serializeToMemoryMd(
  memories: Memory[],
  projectSummary: string,
  lineBudget: number,
): string {
  const lines: string[] = [];
  lines.push("# Agent Memory (exported by agentmemory)");
  lines.push("");

  if (projectSummary) {
    lines.push("## Project Summary");
    lines.push(projectSummary);
    lines.push("");
  }

  lines.push("## Key Memories");
  lines.push("");

  const sorted = [...memories]
    .filter((m) => m.isLatest)
    .sort((a, b) => b.strength - a.strength);

  for (const mem of sorted) {
    if (lines.length >= lineBudget - 2) break;
    lines.push(`### ${mem.title}`);
    const contentLines = mem.content.split("\n");
    for (const cl of contentLines) {
      if (lines.length >= lineBudget - 1) break;
      lines.push(cl);
    }
    lines.push("");
  }

  return lines.slice(0, lineBudget).join("\n");
}

export function registerClaudeBridgeFunction(
  sdk: IIIClient,
  kv: StateKV,
  config: ClaudeBridgeConfig,
): void {
  sdk.registerFunction("mem::claude-bridge-read", 
    async () => {
      if (!config.enabled || !config.memoryFilePath) {
        return { success: false, error: "Claude bridge not configured" };
      }

      try {
        if (!existsSync(config.memoryFilePath)) {
          return { success: true, content: "", parsed: false };
        }
        const content = readFileSync(config.memoryFilePath, "utf-8");
        const { sections } = parseMemoryMd(content);

        await kv.set(KV.claudeBridge, "last-read", {
          timestamp: new Date().toISOString(),
          sections: Object.fromEntries(sections),
          lineCount: content.split("\n").length,
        });
        await recordAudit(kv, "export", "mem::claude-bridge-read", ["last-read"], {
          timestamp: new Date().toISOString(),
          sections: Object.keys(Object.fromEntries(sections)),
          lineCount: content.split("\n").length,
        });

        logger.info("Claude bridge: read MEMORY.md", {
          path: config.memoryFilePath,
          lines: content.split("\n").length,
        });
        return { success: true, content, sections: Object.fromEntries(sections) };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Claude bridge read failed", { error: msg });
        return { success: false, error: msg };
      }
    },
  );

  sdk.registerFunction("mem::claude-bridge-sync", 
    async () => {
      if (!config.enabled || !config.memoryFilePath || !config.projectPath.trim()) {
        return { success: false, error: "Claude bridge not configured" };
      }

      try {
        const project = resolveProject(config.projectPath);
        const memories = await kv.list<Memory>(KV.memories);
        const latestMemories = memories.filter(
          (m) => m.isLatest && (m.project === project || m.project === config.projectPath),
        );

        let profile = await kv
          .get<{ summary?: string }>(KV.profiles, config.projectPath)
          .catch(() => null);
        if (!profile && project !== config.projectPath) {
          profile = await kv.get<{ summary?: string }>(KV.profiles, project).catch(() => null);
        }

        const md = serializeToMemoryMd(
          latestMemories,
          profile?.summary || "",
          config.lineBudget,
        );
        const lines = md.split("\n").length;

        const action = publishMemoryFile(config.memoryFilePath, md);
        if (action === "unchanged") {
          return { success: true, path: config.memoryFilePath, lines, changed: false };
        }

        await recordAudit(kv, "export", "mem::claude-bridge-sync", [], {
          path: config.memoryFilePath,
          memoryCount: latestMemories.length,
          lines,
        });

        logger.info("Claude bridge: synced to MEMORY.md", {
          path: config.memoryFilePath,
          memories: latestMemories.length,
        });
        return { success: true, path: config.memoryFilePath, lines, changed: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Claude bridge sync failed", { error: msg });
        return { success: false, error: msg };
      }
    },
  );
}
