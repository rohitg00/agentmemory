import { join, resolve } from "node:path";
import { homedir } from "node:os";
import type { IIIClient } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import type {
  Memory,
  Lesson,
  Crystal,
  Session,
} from "../types.js";
import { recordAudit } from "./audit.js";
import { confinePath, mkdirConfined, writeConfinedFile } from "./path-guard.js";
const DEFAULT_EXPORT_ROOT = join(homedir(), ".agentmemory");

function getExportRoot(): string {
  return resolve(process.env["AGENTMEMORY_EXPORT_ROOT"] || DEFAULT_EXPORT_ROOT);
}

async function resolveVaultDir(vaultDir?: string): Promise<string | null> {
  const root = getExportRoot();
  const confined = await confinePath(vaultDir || join(root, "vault"), [root]);
  return confined.ok ? confined.path : null;
}

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 100);
}

function hasExportId<T extends { id?: unknown }>(
  item: T | null | undefined,
): item is T & { id: string } {
  return !!item && typeof (item as { id?: unknown }).id === "string" && (item as { id: string }).id.length > 0;
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function safeTimestamp(value: unknown): number {
  if (typeof value !== "string") return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function toFrontmatter(obj: Record<string, unknown>): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((v) => JSON.stringify(String(v))).join(", ")}]`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

function memoryToMd(m: Memory): string {
  const concepts = safeArray<string>(m.concepts);
  const files = safeArray<string>(m.files);
  const relatedIds = safeArray<string>(m.relatedIds);
  const supersedes = safeArray<string>(m.supersedes);
  const title = safeString(m.title, m.id);

  const fm = toFrontmatter({
    id: m.id,
    type: m.type,
    created: m.createdAt,
    updated: m.updatedAt,
    strength: m.strength,
    version: m.version,
    concepts,
    files,
  });

  const relatedLines = relatedIds.map((id) => `- [[${id}]]`).join("\n");
  const supersedesLines = supersedes
    .map((id) => `- [[${id}]] (superseded)`)
    .join("\n");

  const sections = [
    fm,
    "",
    `# ${title}`,
    "",
    safeString(m.content),
  ];

  if (concepts.length > 0) {
    sections.push(
      "",
      "## Concepts",
      concepts.map((c) => `#${c.replace(/\s+/g, "-")}`).join(" "),
    );
  }
  if (relatedLines) {
    sections.push("", "## Related", relatedLines);
  }
  if (supersedesLines) {
    sections.push("", "## Supersedes", supersedesLines);
  }

  return sections.join("\n");
}

function lessonToMd(l: Lesson): string {
  const tags = safeArray<string>(l.tags);
  const sourceIds = safeArray<string>(l.sourceIds);
  const content = safeString(l.content);
  const headline = content ? content.slice(0, 80) : l.id;

  const fm = toFrontmatter({
    id: l.id,
    type: "lesson",
    source: l.source,
    confidence: l.confidence,
    reinforcements: l.reinforcements,
    created: l.createdAt,
    updated: l.updatedAt,
    project: l.project,
    tags,
    decayRate: l.decayRate,
  });

  const sourceLinks = sourceIds.map((id) => `- [[${id}]]`).join("\n");

  const sections = [
    fm,
    "",
    `# Lesson: ${headline}`,
    "",
    content,
  ];

  if (l.context) {
    sections.push("", "## Context", l.context);
  }
  if (tags.length > 0) {
    sections.push(
      "",
      "## Tags",
      tags.map((t) => `#${t.replace(/\s+/g, "-")}`).join(" "),
    );
  }
  if (sourceLinks) {
    sections.push("", "## Sources", sourceLinks);
  }

  return sections.join("\n");
}

function crystalToMd(c: Crystal): string {
  const keyOutcomes = safeArray<string>(c.keyOutcomes);
  const lessons = safeArray<string>(c.lessons);
  const filesAffected = safeArray<string>(c.filesAffected);
  const sourceActionIds = safeArray<string>(c.sourceActionIds);
  const narrative = safeString(c.narrative);
  const headline = narrative ? narrative.slice(0, 80) : c.id;

  const fm = toFrontmatter({
    id: c.id,
    type: "crystal",
    created: c.createdAt,
    project: c.project,
    sessionId: c.sessionId,
    filesAffected,
  });

  const actionLinks = sourceActionIds.map((id) => `- [[${id}]]`).join("\n");

  const sections = [
    fm,
    "",
    `# Crystal: ${headline}`,
    "",
    narrative,
    "",
    "## Key Outcomes",
    ...keyOutcomes.map((o) => `- ${o}`),
  ];

  if (lessons.length > 0) {
    sections.push("", "## Lessons", ...lessons.map((l) => `- ${l}`));
  }
  if (filesAffected.length > 0) {
    sections.push("", "## Files", ...filesAffected.map((f) => `- \`${f}\``));
  }
  if (actionLinks) {
    sections.push("", "## Source Actions", actionLinks);
  }

  return sections.join("\n");
}

function sessionToMd(s: Session): string {
  const project = safeString(s.project, "unknown");
  const status = safeString(s.status, "unknown");
  const startedAt = safeString(s.startedAt, "");
  const cwd = safeString(s.cwd, "");

  const fm = toFrontmatter({
    id: s.id,
    type: "session",
    project,
    status,
    started: startedAt || undefined,
    ended: s.endedAt,
    observations: s.observationCount,
  });

  return [
    fm,
    "",
    `# Session: ${project}`,
    "",
    `**Status:** ${status}`,
    startedAt ? `**Started:** ${startedAt}` : "",
    s.endedAt ? `**Ended:** ${s.endedAt}` : "",
    `**Observations:** ${s.observationCount ?? 0}`,
    cwd ? `**CWD:** \`${cwd}\`` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

interface ExportError {
  id: string;
  path: string;
  error: string;
}

export function registerObsidianExportFunction(
  sdk: IIIClient,
  kv: StateKV,
): void {
  sdk.registerFunction("mem::obsidian-export",
    async (data: { vaultDir?: string; types?: string[] } | undefined) => {
      if (!data || typeof data !== "object") {
        return { success: false, error: "payload is required" };
      }
      if (data.vaultDir !== undefined && typeof data.vaultDir !== "string") {
        return { success: false, error: "vaultDir must be a string" };
      }
      if (data.types !== undefined) {
        if (
          !Array.isArray(data.types) ||
          !data.types.every((t): t is string => typeof t === "string")
        ) {
          return { success: false, error: "types must be an array of strings" };
        }
      }

      const vaultDir = await resolveVaultDir(data.vaultDir);
      if (!vaultDir) {
        return {
          success: false,
          error: `vaultDir must be inside ${getExportRoot()}`,
        };
      }
      const exportTypes = new Set(
        data.types ?? ["memories", "lessons", "crystals", "sessions"],
      );

      const dirs = {
        memories: join(vaultDir, "memories"),
        lessons: join(vaultDir, "lessons"),
        crystals: join(vaultDir, "crystals"),
        sessions: join(vaultDir, "sessions"),
      };

      try {
        const roots = [getExportRoot()];
        await Promise.all(Object.values(dirs).map((dir) => mkdirConfined(dir, roots)));

        const stats = { memories: 0, lessons: 0, crystals: 0, sessions: 0 };
        const errors: ExportError[] = [];
        const memoryMoc: string[] = [];
        const lessonMoc: string[] = [];
        const crystalMoc: string[] = [];
        const sessionMoc: string[] = [];

        const [memories, lessons, crystals, sessions] = await Promise.all([
          exportTypes.has("memories") ? kv.list<Memory>(KV.memories) : Promise.resolve([] as Memory[]),
          exportTypes.has("lessons") ? kv.list<Lesson>(KV.lessons) : Promise.resolve([] as Lesson[]),
          exportTypes.has("crystals") ? kv.list<Crystal>(KV.crystals) : Promise.resolve([] as Crystal[]),
          exportTypes.has("sessions") ? kv.list<Session>(KV.sessions) : Promise.resolve([] as Session[]),
        ]);

        for (const m of memories.filter(
          (m): m is Memory & { id: string } => hasExportId(m) && m.isLatest === true,
        )) {
          const filename = `${sanitize(m.id)}.md`;
          const filepath = join(dirs.memories, filename);
          try {
            await writeConfinedFile(filepath, memoryToMd(m), roots);
            stats.memories++;
            memoryMoc.push(
              `- [[memories/${sanitize(m.id)}|${safeString(m.title, m.id)}]] (${m.type}, strength: ${m.strength ?? 0})`,
            );
          } catch (err) {
            errors.push({
              id: m.id,
              path: filepath,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        for (const l of lessons.filter(
          (l): l is Lesson & { id: string } => hasExportId(l) && !l.deleted,
        )) {
          const filename = `${sanitize(l.id)}.md`;
          const filepath = join(dirs.lessons, filename);
          try {
            await writeConfinedFile(filepath, lessonToMd(l), roots);
            stats.lessons++;
            const headline = safeString(l.content).slice(0, 60) || l.id;
            lessonMoc.push(
              `- [[lessons/${sanitize(l.id)}|${headline}]] (confidence: ${l.confidence ?? 0})`,
            );
          } catch (err) {
            errors.push({
              id: l.id,
              path: filepath,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        for (const c of crystals.filter(hasExportId)) {
          const filename = `${sanitize(c.id)}.md`;
          const filepath = join(dirs.crystals, filename);
          try {
            await writeConfinedFile(filepath, crystalToMd(c), roots);
            stats.crystals++;
            const headline = safeString(c.narrative).slice(0, 60) || c.id;
            crystalMoc.push(`- [[crystals/${sanitize(c.id)}|${headline}]]`);
          } catch (err) {
            errors.push({
              id: c.id,
              path: filepath,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const recent = sessions
          .filter(hasExportId)
          .sort((a, b) => safeTimestamp(b.startedAt) - safeTimestamp(a.startedAt))
          .slice(0, 50);
        for (const s of recent) {
          const filename = `${sanitize(s.id)}.md`;
          const filepath = join(dirs.sessions, filename);
          try {
            await writeConfinedFile(filepath, sessionToMd(s), roots);
            stats.sessions++;
            sessionMoc.push(
              `- [[sessions/${sanitize(s.id)}|${safeString(s.project, "unknown")} (${safeString(s.status, "unknown")})]]`,
            );
          } catch (err) {
            errors.push({
              id: s.id,
              path: filepath,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const exportedAt = new Date().toISOString();
        const moc = [
          "---",
          "type: moc",
          `exported: ${exportedAt}`,
          "---",
          "",
          "# agentmemory vault",
          "",
          `Exported: ${exportedAt}`,
          "",
          `## Memories (${stats.memories})`,
          ...memoryMoc,
          "",
          `## Lessons (${stats.lessons})`,
          ...lessonMoc,
          "",
          `## Crystals (${stats.crystals})`,
          ...crystalMoc,
          "",
          `## Sessions (${stats.sessions})`,
          ...sessionMoc,
        ].join("\n");

        await writeConfinedFile(join(vaultDir, "MOC.md"), moc, roots);

        await recordAudit(kv, "obsidian_export", "mem::obsidian-export", [], {
          vaultDir,
          stats,
        });

        return {
          success: true,
          exported: stats,
          errors: errors.length > 0 ? errors : undefined,
          vaultDir,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
          vaultDir,
        };
      }
    },
  );
}
