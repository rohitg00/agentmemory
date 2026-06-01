import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import type { ISdk } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import type {
  Memory,
  Lesson,
  Crystal,
  Session,
} from "../types.js";
import { recordAudit } from "./audit.js";
const DEFAULT_EXPORT_ROOT = join(homedir(), ".agentmemory");

function getExportRoot(): string {
  return resolve(process.env["AGENTMEMORY_EXPORT_ROOT"] || DEFAULT_EXPORT_ROOT);
}

function resolveVaultDir(vaultDir?: string): string | null {
  const root = getExportRoot();
  const resolved = resolve(vaultDir || join(root, "vault"));
  if (resolved === root || resolved.startsWith(root + sep)) {
    return resolved;
  }
  return null;
}

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 100);
}

function hasExportId<T extends { id?: unknown }>(item: T | null | undefined): item is T & { id: string } {
  return typeof item?.id === "string" && item.id.length > 0;
}

function timestamp(value: unknown): number {
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
  const fm = toFrontmatter({
    id: m.id,
    type: m.type,
    created: m.createdAt,
    updated: m.updatedAt,
    strength: m.strength,
    version: m.version,
    concepts: m.concepts,
    files: m.files,
  });

  const related = (m.relatedIds || [])
    .map((id) => `- [[${id}]]`)
    .join("\n");
  const supersedes = (m.supersedes || [])
    .map((id) => `- [[${id}]] (superseded)`)
    .join("\n");

  const sections = [
    fm,
    "",
    `# ${m.title}`,
    "",
    m.content,
  ];

  if (m.concepts.length > 0) {
    sections.push("", "## Concepts", m.concepts.map((c) => `#${c.replace(/\s+/g, "-")}`).join(" "));
  }
  if (related) {
    sections.push("", "## Related", related);
  }
  if (supersedes) {
    sections.push("", "## Supersedes", supersedes);
  }

  return sections.join("\n");
}

function lessonToMd(l: Lesson): string {
  const fm = toFrontmatter({
    id: l.id,
    type: "lesson",
    source: l.source,
    confidence: l.confidence,
    reinforcements: l.reinforcements,
    created: l.createdAt,
    updated: l.updatedAt,
    project: l.project,
    tags: l.tags,
    decayRate: l.decayRate,
  });

  const sourceLinks = l.sourceIds
    .map((id) => `- [[${id}]]`)
    .join("\n");

  const sections = [
    fm,
    "",
    `# Lesson: ${l.content.slice(0, 80)}`,
    "",
    l.content,
  ];

  if (l.context) {
    sections.push("", "## Context", l.context);
  }
  if (l.tags.length > 0) {
    sections.push("", "## Tags", l.tags.map((t) => `#${t.replace(/\s+/g, "-")}`).join(" "));
  }
  if (sourceLinks) {
    sections.push("", "## Sources", sourceLinks);
  }

  return sections.join("\n");
}

function crystalToMd(c: Crystal): string {
  const fm = toFrontmatter({
    id: c.id,
    type: "crystal",
    created: c.createdAt,
    project: c.project,
    sessionId: c.sessionId,
    filesAffected: c.filesAffected,
  });

  const actionLinks = c.sourceActionIds
    .map((id) => `- [[${id}]]`)
    .join("\n");

  const sections = [
    fm,
    "",
    `# Crystal: ${c.narrative.slice(0, 80)}`,
    "",
    c.narrative,
    "",
    "## Key Outcomes",
    ...c.keyOutcomes.map((o) => `- ${o}`),
  ];

  if (c.lessons.length > 0) {
    sections.push("", "## Lessons", ...c.lessons.map((l) => `- ${l}`));
  }
  if (c.filesAffected.length > 0) {
    sections.push("", "## Files", ...c.filesAffected.map((f) => `- \`${f}\``));
  }
  if (actionLinks) {
    sections.push("", "## Source Actions", actionLinks);
  }

  return sections.join("\n");
}

function sessionToMd(s: Session): string {
  const fm = toFrontmatter({
    id: s.id,
    type: "session",
    project: s.project,
    status: s.status,
    started: s.startedAt,
    ended: s.endedAt,
    observations: s.observationCount,
  });

  return [
    fm,
    "",
    `# Session: ${s.project}`,
    "",
    `**Status:** ${s.status}`,
    `**Started:** ${s.startedAt}`,
    s.endedAt ? `**Ended:** ${s.endedAt}` : "",
    `**Observations:** ${s.observationCount}`,
    `**CWD:** \`${s.cwd}\``,
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
  sdk: ISdk,
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

      const vaultDir = resolveVaultDir(data.vaultDir);
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

      await Promise.all(
        Object.values(dirs).map((dir) => mkdir(dir, { recursive: true })),
      );

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

      for (const m of memories.filter((m) => m.isLatest && hasExportId(m))) {
        try {
          const filename = `${sanitize(m.id)}.md`;
          const filepath = join(dirs.memories, filename);
          await writeFile(filepath, memoryToMd(m));
          stats.memories++;
          memoryMoc.push(`- [[memories/${sanitize(m.id)}|${m.title}]] (${m.type}, strength: ${m.strength})`);
        } catch (err) {
          errors.push({ id: m.id, path: join(dirs.memories, `${sanitize(m.id)}.md`), error: err instanceof Error ? err.message : String(err) });
        }
      }

      for (const l of lessons.filter((l) => !l.deleted && hasExportId(l))) {
        try {
          const filename = `${sanitize(l.id)}.md`;
          const filepath = join(dirs.lessons, filename);
          await writeFile(filepath, lessonToMd(l));
          stats.lessons++;
          lessonMoc.push(`- [[lessons/${sanitize(l.id)}|${l.content.slice(0, 60)}]] (confidence: ${l.confidence})`);
        } catch (err) {
          errors.push({ id: l.id, path: join(dirs.lessons, `${sanitize(l.id)}.md`), error: err instanceof Error ? err.message : String(err) });
        }
      }

      for (const c of crystals.filter(hasExportId)) {
        try {
          const filename = `${sanitize(c.id)}.md`;
          const filepath = join(dirs.crystals, filename);
          await writeFile(filepath, crystalToMd(c));
          stats.crystals++;
          crystalMoc.push(`- [[crystals/${sanitize(c.id)}|${c.narrative.slice(0, 60)}]]`);
        } catch (err) {
          errors.push({ id: c.id, path: join(dirs.crystals, `${sanitize(c.id)}.md`), error: err instanceof Error ? err.message : String(err) });
        }
      }

      const recent = sessions
        .filter(hasExportId)
        .sort(
          (a, b) =>
            timestamp(b.startedAt) -
            timestamp(a.startedAt),
        )
        .slice(0, 50);
      for (const s of recent) {
        try {
          const filename = `${sanitize(s.id)}.md`;
          const filepath = join(dirs.sessions, filename);
          await writeFile(filepath, sessionToMd(s));
          stats.sessions++;
          sessionMoc.push(`- [[sessions/${sanitize(s.id)}|${s.project} (${s.status})]]`);
        } catch (err) {
          errors.push({ id: s.id, path: join(dirs.sessions, `${sanitize(s.id)}.md`), error: err instanceof Error ? err.message : String(err) });
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

      await writeFile(join(vaultDir, "MOC.md"), moc);

      await recordAudit(kv, "obsidian_export", "mem::obsidian-export", [], {
        vaultDir,
        stats,
      });

      return { success: true, exported: stats, errors: errors.length > 0 ? errors : undefined, vaultDir };
    },
  );
}
