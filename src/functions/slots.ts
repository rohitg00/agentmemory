import type { ISdk } from "iii-sdk";
import type { MemorySlot, CompressedObservation } from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { recordAudit } from "./audit.js";
import { getEnvVar } from "../config.js";
import { logger } from "../logger.js";
import { createHash } from "node:crypto";

type SlotScope = "project" | "global";

const DEFAULT_SIZE_LIMIT = 2000;

/** KV scope holding the pre-write copy of every slot mutation. */
const SLOT_HISTORY_SCOPE = "mem:slots:history";
const DEFAULT_SLOT_HISTORY = 20;
/** Fractions of sizeLimit at which a read starts telling the caller to compact. */
const SLOT_WARN_PCT = 70;
const SLOT_URGENT_PCT = 90;

export interface SlotHistoryEntry {
  id: string;
  label: string;
  operation: "append" | "replace";
  content: string;
  size: number;
  rev: number;
  at: string;
}

export interface SlotStats {
  size: number;
  sizeLimit: number;
  free: number;
  pctUsed: number;
  rev: number;
  contentHash: string;
  warning?: string;
}

/**
 * Headroom and revision of a slot, returned alongside every read and write so a
 * caller can see it is running out of room before an append starts failing, and
 * can pass the revision back to prove it merged from the current content.
 */
export function slotStats(slot: MemorySlot): SlotStats {
  const size = slot.content.length;
  const sizeLimit = slot.sizeLimit || 1;
  const pctUsed = Math.round((size / sizeLimit) * 100);
  const stats: SlotStats = {
    size,
    sizeLimit,
    free: Math.max(0, sizeLimit - size),
    pctUsed,
    rev: slot.rev ?? 0,
    contentHash: createHash("sha1").update(slot.content).digest("hex").slice(0, 12),
  };
  if (pctUsed >= SLOT_URGENT_PCT) {
    stats.warning = `slot is ${pctUsed}% full (${stats.free} chars free) — compact it now; the next append of this size will fail`;
  } else if (pctUsed >= SLOT_WARN_PCT) {
    stats.warning = `slot is ${pctUsed}% full (${stats.free} chars free) — compact before the next large append`;
  }
  return stats;
}

function slotHistoryLimit(): number {
  const raw = parseInt(getEnvVar("AGENTMEMORY_SLOT_HISTORY") || "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SLOT_HISTORY;
}

/**
 * Copy the slot as it stands before a mutation, keeping the most recent N per
 * label. History is best-effort: a slot write is never failed because its undo
 * copy could not be stored.
 */
async function snapshotSlot(
  kv: StateKV,
  slot: MemorySlot,
  operation: SlotHistoryEntry["operation"],
): Promise<void> {
  try {
    const entry: SlotHistoryEntry = {
      id: `${slot.label}_${Date.now().toString(36)}`,
      label: slot.label,
      operation,
      content: slot.content,
      size: slot.content.length,
      rev: slot.rev ?? 0,
      at: nowIso(),
    };
    await kv.set(SLOT_HISTORY_SCOPE, entry.id, entry);
    const keep = slotHistoryLimit();
    const mine = (await kv.list<SlotHistoryEntry>(SLOT_HISTORY_SCOPE))
      .filter((e) => e.label === slot.label)
      .sort((a, b) => (a.at || "").localeCompare(b.at || ""));
    for (const old of mine.slice(0, Math.max(0, mine.length - keep))) {
      await kv.delete(SLOT_HISTORY_SCOPE, old.id).catch(() => {});
    }
  } catch (err) {
    logger.warn("slot history snapshot failed", {
      label: slot.label,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export const DEFAULT_SLOTS: ReadonlyArray<
  Omit<MemorySlot, "createdAt" | "updatedAt">
> = [
  {
    label: "persona",
    content: "",
    sizeLimit: 1000,
    description:
      "How the agent should see itself: role, tone, behavioural guidelines.",
    pinned: true,
    readOnly: false,
    scope: "global",
  },
  {
    label: "user_preferences",
    content: "",
    sizeLimit: 2000,
    description:
      "Coding style, tool preferences, naming conventions, and other habits the user wants preserved across sessions.",
    pinned: true,
    readOnly: false,
    scope: "global",
  },
  {
    label: "tool_guidelines",
    content: "",
    sizeLimit: 1500,
    description:
      "Rules the agent should follow when picking or sequencing tools (e.g. prefer X over Y, never run Z without confirmation).",
    pinned: true,
    readOnly: false,
    scope: "global",
  },
  {
    label: "project_context",
    content: "",
    sizeLimit: 3000,
    description:
      "Architecture decisions, codebase conventions, build/test commands, and cross-cutting constraints for the current project.",
    pinned: true,
    readOnly: false,
    scope: "project",
  },
  {
    label: "guidance",
    content: "",
    sizeLimit: 1500,
    description:
      "Active advice for the next session: what to focus on, what to avoid, open risks.",
    pinned: true,
    readOnly: false,
    scope: "project",
  },
  {
    label: "pending_items",
    content: "",
    sizeLimit: 2000,
    description:
      "Unfinished work, explicit TODOs, and promises made but not yet delivered.",
    pinned: true,
    readOnly: false,
    scope: "project",
  },
  {
    label: "session_patterns",
    content: "",
    sizeLimit: 1500,
    description:
      "Recurring behaviours and common struggles observed across recent sessions.",
    pinned: false,
    readOnly: false,
    scope: "project",
  },
  {
    label: "self_notes",
    content: "",
    sizeLimit: 1500,
    description:
      "Free-form notes the agent keeps for itself: hypotheses, dead ends, things to revisit.",
    pinned: false,
    readOnly: false,
    scope: "project",
  },
];

// Read merged env so values loaded from ~/.agentmemory/.env are
// honoured. process.env alone misses .env-only exports (#678).
export function isSlotsEnabled(): boolean {
  return getEnvVar("AGENTMEMORY_SLOTS") === "true";
}

export function isReflectEnabled(): boolean {
  return getEnvVar("AGENTMEMORY_REFLECT") === "true";
}

function scopeKv(scope: SlotScope): string {
  return scope === "global" ? KV.globalSlots : KV.slots;
}

function nowIso(): string {
  return new Date().toISOString();
}

function validateLabel(label: unknown): string | null {
  if (typeof label !== "string") return null;
  const trimmed = label.trim();
  if (!trimmed || trimmed.length > 64) return null;
  if (!/^[a-z][a-z0-9_]*$/.test(trimmed)) return null;
  return trimmed;
}

async function readSlot(
  kv: StateKV,
  label: string,
): Promise<{ slot: MemorySlot | null; scope: SlotScope }> {
  const project = await kv.get<MemorySlot>(KV.slots, label);
  if (project) return { slot: project, scope: "project" };
  const global = await kv.get<MemorySlot>(KV.globalSlots, label);
  if (global) return { slot: global, scope: "global" };
  return { slot: null, scope: "project" };
}

async function readSlotInScope(
  kv: StateKV,
  label: string,
  scope: SlotScope,
): Promise<MemorySlot | null> {
  return kv.get<MemorySlot>(scopeKv(scope), label);
}

function validateScope(raw: unknown): SlotScope | null {
  if (raw === undefined || raw === null) return "project";
  if (raw === "project" || raw === "global") return raw;
  return null;
}

function validateSizeLimit(raw: unknown): number | null | undefined {
  if (raw === undefined || raw === null) return DEFAULT_SIZE_LIMIT;
  if (typeof raw !== "number") return null;
  if (!Number.isInteger(raw) || raw < 1 || raw > 20000) return null;
  return raw;
}

async function seedDefaults(kv: StateKV): Promise<void> {
  const ts = nowIso();
  for (const tmpl of DEFAULT_SLOTS) {
    const target = scopeKv(tmpl.scope);
    const existing = await kv.get<MemorySlot>(target, tmpl.label);
    if (existing) continue;
    const slot: MemorySlot = {
      ...tmpl,
      createdAt: ts,
      updatedAt: ts,
    };
    await kv.set(target, tmpl.label, slot);
  }
}

export async function listPinnedSlots(kv: StateKV): Promise<MemorySlot[]> {
  const [project, global] = await Promise.all([
    kv.list<MemorySlot>(KV.slots),
    kv.list<MemorySlot>(KV.globalSlots),
  ]);
  const merged = new Map<string, MemorySlot>();
  for (const s of global) merged.set(s.label, s);
  for (const s of project) merged.set(s.label, s);
  return Array.from(merged.values())
    .filter((s) => s.pinned && s.content.trim().length > 0)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function renderPinnedContext(slots: MemorySlot[]): string {
  if (slots.length === 0) return "";
  const lines: string[] = ["# agentmemory pinned slots", ""];
  for (const slot of slots) {
    lines.push(`## ${slot.label}`);
    lines.push(slot.content.trim());
    lines.push("");
  }
  return lines.join("\n");
}

export function registerSlotsFunctions(sdk: ISdk, kv: StateKV): void {
  void seedDefaults(kv).catch((err) => {
    logger.warn("slot defaults seed failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  sdk.registerFunction("mem::slot-list", async () => {
    const [project, global] = await Promise.all([
      kv.list<MemorySlot>(KV.slots),
      kv.list<MemorySlot>(KV.globalSlots),
    ]);
    const merged = new Map<string, MemorySlot>();
    for (const s of global) merged.set(s.label, s);
    for (const s of project) merged.set(s.label, s);
    const slots = Array.from(merged.values())
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((slot) => ({ ...slot, ...slotStats(slot) }));
    return { success: true, slots };
  });

  sdk.registerFunction(
    "mem::slot-get",
    async (data: { label?: string }) => {
      const label = validateLabel(data?.label);
      if (!label) return { success: false, error: "label required (lowercase, starts with letter, [a-z0-9_])" };
      const { slot, scope } = await readSlot(kv, label);
      if (!slot) return { success: false, error: "slot not found" };
      return { success: true, slot, scope, ...slotStats(slot) };
    },
  );

  sdk.registerFunction(
    "mem::slot-create",
    async (data: {
      label?: string;
      content?: string;
      sizeLimit?: number;
      description?: string;
      pinned?: boolean;
      scope?: SlotScope;
    }) => {
      const label = validateLabel(data?.label);
      if (!label) return { success: false, error: "label required (lowercase, starts with letter, [a-z0-9_])" };
      const scope = validateScope(data?.scope);
      if (!scope) return { success: false, error: "scope must be 'project' or 'global'" };
      const sizeLimit = validateSizeLimit(data?.sizeLimit);
      if (sizeLimit === null) {
        return { success: false, error: "sizeLimit must be an integer between 1 and 20000" };
      }
      const content = typeof data?.content === "string" ? data.content : "";
      if (content.length > sizeLimit) {
        return { success: false, error: `content exceeds sizeLimit (${content.length} > ${sizeLimit})` };
      }
      const description = typeof data?.description === "string" ? data.description : "";
      const pinned = typeof data?.pinned === "boolean" ? data.pinned : true;
      return withKeyedLock(`slot:${label}`, async () => {
        // Duplicate check is scope-local so a project slot can shadow a
        // global slot with the same label — matches the read precedence.
        const existing = await readSlotInScope(kv, label, scope);
        if (existing) return { success: false, error: `slot already exists in ${scope} scope` };
        const ts = nowIso();
        const slot: MemorySlot = {
          label,
          content,
          sizeLimit: sizeLimit as number,
          description,
          pinned,
          readOnly: false,
          scope,
          createdAt: ts,
          updatedAt: ts,
        };
        await kv.set(scopeKv(scope), label, slot);
        await recordAudit(kv, "slot_create", "mem::slot-create", [label], {
          scope,
          sizeLimit: slot.sizeLimit,
          pinned: slot.pinned,
        });
        return { success: true, slot };
      });
    },
  );

  sdk.registerFunction(
    "mem::slot-append",
    async (data: { label?: string; text?: string }) => {
      const label = validateLabel(data?.label);
      if (!label) return { success: false, error: "label required" };
      const text = typeof data?.text === "string" ? data.text : "";
      if (!text) return { success: false, error: "text required" };
      return withKeyedLock(`slot:${label}`, async () => {
        const { slot, scope } = await readSlot(kv, label);
        if (!slot) return { success: false, error: "slot not found (use mem::slot-create first)" };
        if (slot.readOnly) return { success: false, error: "slot is read-only" };
        const sep = slot.content && !slot.content.endsWith("\n") ? "\n" : "";
        const next = `${slot.content}${sep}${text}`;
        if (next.length > slot.sizeLimit) {
          return {
            success: false,
            error: `append would exceed sizeLimit (${next.length} > ${slot.sizeLimit}). Use mem::slot-replace to compact first.`,
            currentSize: slot.content.length,
            sizeLimit: slot.sizeLimit,
          };
        }
        await snapshotSlot(kv, slot, "append");
        const updated: MemorySlot = {
          ...slot,
          content: next,
          rev: (slot.rev ?? 0) + 1,
          updatedAt: nowIso(),
        };
        await kv.set(scopeKv(scope), label, updated);
        await recordAudit(kv, "slot_append", "mem::slot-append", [label], {
          scope,
          added: text.length,
          total: next.length,
        });
        return { success: true, slot: updated, ...slotStats(updated) };
      });
    },
  );

  sdk.registerFunction(
    "mem::slot-replace",
    async (data: {
      label?: string;
      content?: string;
      expectedRev?: number;
      expectedHash?: string;
    }) => {
      const label = validateLabel(data?.label);
      if (!label) return { success: false, error: "label required" };
      if (typeof data?.content !== "string") return { success: false, error: "content required (string)" };
      const content: string = data.content;
      return withKeyedLock(`slot:${label}`, async () => {
        const { slot, scope } = await readSlot(kv, label);
        if (!slot) return { success: false, error: "slot not found (use mem::slot-create first)" };
        if (slot.readOnly) return { success: false, error: "slot is read-only" };
        if (content.length > slot.sizeLimit) {
          return {
            success: false,
            error: `content exceeds sizeLimit (${content.length} > ${slot.sizeLimit})`,
            sizeLimit: slot.sizeLimit,
          };
        }
        const current = slotStats(slot);
        if (data.expectedRev !== undefined && Number(data.expectedRev) !== current.rev) {
          return {
            success: false,
            error: `slot changed since you read it (expectedRev ${data.expectedRev}, current ${current.rev}) — re-read the slot and merge, do not overwrite`,
            current,
          };
        }
        if (typeof data.expectedHash === "string" && data.expectedHash !== current.contentHash) {
          return {
            success: false,
            error: `slot changed since you read it (expectedHash ${data.expectedHash}, current ${current.contentHash}) — re-read the slot and merge, do not overwrite`,
            current,
          };
        }
        await snapshotSlot(kv, slot, "replace");
        const updated: MemorySlot = {
          ...slot,
          content,
          rev: (slot.rev ?? 0) + 1,
          updatedAt: nowIso(),
        };
        await kv.set(scopeKv(scope), label, updated);
        await recordAudit(kv, "slot_replace", "mem::slot-replace", [label], {
          scope,
          before: slot.content.length,
          after: content.length,
        });
        return {
          success: true,
          slot: updated,
          previousSize: slot.content.length,
          ...slotStats(updated),
        };
      });
    },
  );

  sdk.registerFunction(
    "mem::slot-history",
    async (data: { label?: string; id?: string; restore?: boolean }) => {
      const label = validateLabel(data?.label);
      if (!label) return { success: false, error: "label required" };
      const entries = (await kv.list<SlotHistoryEntry>(SLOT_HISTORY_SCOPE))
        .filter((e) => e.label === label)
        .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
      if (data?.restore === true) {
        const target = data.id ? entries.find((e) => e.id === data.id) : entries[0];
        if (!target) return { success: false, error: "no history entry to restore" };
        return {
          success: true,
          entry: target,
          restoreWith: {
            function_id: "mem::slot-replace",
            label,
            content: target.content,
          },
        };
      }
      return {
        success: true,
        label,
        entries: entries.map((e) => ({
          id: e.id,
          at: e.at,
          operation: e.operation,
          size: e.size,
          rev: e.rev,
          preview: (e.content || "").slice(0, 200),
        })),
      };
    },
  );

  sdk.registerFunction(
    "mem::slot-delete",
    async (data: { label?: string }) => {
      const label = validateLabel(data?.label);
      if (!label) return { success: false, error: "label required" };
      return withKeyedLock(`slot:${label}`, async () => {
        const { slot, scope } = await readSlot(kv, label);
        if (!slot) return { success: false, error: "slot not found" };
        if (slot.readOnly) return { success: false, error: "slot is read-only" };
        await kv.delete(scopeKv(scope), label);
        await recordAudit(kv, "slot_delete", "mem::slot-delete", [label], {
          scope,
          size: slot.content.length,
        });
        return { success: true };
      });
    },
  );

  sdk.registerFunction(
    "mem::slot-reflect",
    async (data: { sessionId?: string; maxObservations?: number }) => {
      if (!data?.sessionId || typeof data.sessionId !== "string") {
        return { success: false, error: "sessionId required" };
      }
      const max =
        typeof data.maxObservations === "number" &&
        Number.isInteger(data.maxObservations) &&
        data.maxObservations > 0
          ? Math.min(200, data.maxObservations)
          : 50;
      const observations = await kv.list<CompressedObservation>(
        KV.observations(data.sessionId),
      );
      if (observations.length === 0) {
        return { success: true, applied: 0, reason: "no observations for session" };
      }
      const recent = observations
        .slice()
        .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
        .slice(0, max);

      const pendingLines: string[] = [];
      const patternCounts = new Map<string, number>();
      const files = new Set<string>();
      for (const obs of recent) {
        const title = (obs.title || "").toLowerCase();
        const narrative = (obs.narrative || "").toLowerCase();
        if (narrative.includes("todo") || title.includes("todo")) {
          pendingLines.push(`- ${obs.title || obs.id}`);
        }
        if (obs.type === "error") {
          patternCounts.set("errors", (patternCounts.get("errors") ?? 0) + 1);
        }
        if (obs.type === "command_run") {
          patternCounts.set("commands", (patternCounts.get("commands") ?? 0) + 1);
        }
        if (obs.files) for (const f of obs.files) files.add(f);
      }

      let applied = 0;

      if (pendingLines.length > 0) {
        const pendingApplied = await withKeyedLock(`slot:pending_items`, async () => {
          const { slot, scope } = await readSlot(kv, "pending_items");
          if (!slot) return false;
          const already = new Set(slot.content.split("\n"));
          const fresh = pendingLines.filter((line) => !already.has(line));
          if (fresh.length === 0) return false;
          const sep = slot.content && !slot.content.endsWith("\n") ? "\n" : "";
          const next = `${slot.content}${sep}${fresh.join("\n")}`;
          const truncated = next.length > slot.sizeLimit
            ? next.slice(next.length - slot.sizeLimit)
            : next;
          await kv.set(scopeKv(scope), "pending_items", {
            ...slot,
            content: truncated,
            updatedAt: nowIso(),
          });
          return true;
        });
        if (pendingApplied) applied++;
      }

      if (patternCounts.size > 0) {
        const patternsApplied = await withKeyedLock(`slot:session_patterns`, async () => {
          const { slot, scope } = await readSlot(kv, "session_patterns");
          if (!slot) return false;
          const summary = [
            `last reflection: ${nowIso()}`,
            ...Array.from(patternCounts.entries()).map(
              ([kind, count]) => `- ${kind}: ${count} in last ${recent.length} observations`,
            ),
          ].join("\n");
          const next =
            summary.length > slot.sizeLimit ? summary.slice(0, slot.sizeLimit) : summary;
          await kv.set(scopeKv(scope), "session_patterns", {
            ...slot,
            content: next,
            updatedAt: nowIso(),
          });
          return true;
        });
        if (patternsApplied) applied++;
      }

      if (files.size > 0) {
        const ctxApplied = await withKeyedLock(`slot:project_context`, async () => {
          const { slot, scope } = await readSlot(kv, "project_context");
          if (!slot) return false;
          const already = slot.content;
          const fresh = Array.from(files)
            .filter((f) => !already.includes(f))
            .slice(0, 20);
          if (fresh.length === 0) return false;
          const header =
            already.length === 0 ? "Files touched in recent sessions:" : "";
          const sep = already && !already.endsWith("\n") ? "\n" : "";
          const nextRaw = `${already}${sep}${header ? header + "\n" : ""}${fresh
            .map((f) => `- ${f}`)
            .join("\n")}`;
          const next =
            nextRaw.length > slot.sizeLimit
              ? nextRaw.slice(nextRaw.length - slot.sizeLimit)
              : nextRaw;
          await kv.set(scopeKv(scope), "project_context", {
            ...slot,
            content: next,
            updatedAt: nowIso(),
          });
          return true;
        });
        if (ctxApplied) applied++;
      }

      if (applied > 0) {
        await recordAudit(kv, "slot_reflect", "mem::slot-reflect", [data.sessionId], {
          observationCount: recent.length,
          slotsUpdated: applied,
        });
      }

      return { success: true, applied, observationsReviewed: recent.length };
    },
  );
}
