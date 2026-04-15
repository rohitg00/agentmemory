import type { ISdk } from "iii-sdk";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { Memory, ClaudeBridgeConfig } from "../types.js";
import { KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { recordAudit } from "./audit.js";
import { logger } from "../logger.js";

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
  lines.push("# Agent Memory (auto-synced by agentmemory)");
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
  sdk: ISdk,
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
      if (!config.enabled || !config.memoryFilePath) {
        return { success: false, error: "Claude bridge not configured" };
      }

      try {
        const memories = await kv.list<Memory>(KV.memories);
        const latestMemories = memories.filter((m) => m.isLatest);

        let projectSummary = "";
        if (config.projectPath) {
          const profile = await kv
            .get<{ summary?: string }>(KV.profiles, config.projectPath)
            .catch(() => null);
          projectSummary = profile?.summary || "";
        }

        const md = serializeToMemoryMd(
          latestMemories,
          projectSummary,
          config.lineBudget,
        );

        const dir = dirname(config.memoryFilePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(config.memoryFilePath, md, "utf-8");

        await recordAudit(kv, "export", "mem::claude-bridge-sync", [], {
          path: config.memoryFilePath,
          memoryCount: latestMemories.length,
          lines: md.split("\n").length,
        });

        logger.info("Claude bridge: synced to MEMORY.md", {
          path: config.memoryFilePath,
          memories: latestMemories.length,
        });
        return { success: true, path: config.memoryFilePath, lines: md.split("\n").length };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Claude bridge sync failed", { error: msg });
        return { success: false, error: msg };
      }
    },
  );
}
