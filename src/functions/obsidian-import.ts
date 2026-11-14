import { constants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import type { IIIClient } from "iii-sdk";
import { parseDocument } from "yaml";
import type { Memory, ObsidianVaultNote } from "../types.js";
import { collectAll, type StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import { withKeyedLock } from "../state/keyed-mutex.js";
import { memoryWriteToken } from "../state/memory-utils.js";
import { safeAudit } from "./audit.js";
import { confinePath } from "./path-guard.js";
import { stripPrivateData } from "./privacy.js";
import { memoryMarkdownTail } from "./obsidian-export.js";
import {
  exportedNoteContext, normalizedNote, noteIdentity, noteStateDigest,
  obsidianExportRoot, readonlyNoteDigest, vaultDigest,
} from "./obsidian-vault.js";

const MEMORY_TYPES = new Set(["pattern", "preference", "architecture", "bug", "workflow", "fact"]);
const FRONTMATTER_FIELDS = new Set(["id", "type", "created", "updated", "strength", "version", "concepts", "files"]);
const MAX_NOTE_BYTES = 2 * 1024 * 1024;
const MAX_VAULT_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 10_000;

export interface ObsidianImportResult {
  success: boolean;
  dryRun: boolean;
  planned: { creates: number; updates: number; unchanged: number };
  applied: { created: number; updated: number };
  conflicts: Array<{ file: string; memoryId: string; storeId: string; prefer: "vault" | "store" }>;
  warnings: Array<{ file: string; code: "legacy_export_context"; mutableFields: string[]; message: string }>;
  errors: Array<{ file?: string; error: string; memoryId?: string; writeOutcomeUncertain?: boolean }>;
  files: Array<{ file: string; action: "create" | "update" | "unchanged" | "store"; memoryId?: string; appliedMemoryId?: string }>;
}

interface RawNote {
  path: string;
  file: string;
  digest: string;
  fields: Record<string, unknown>;
  markdown: string;
}

interface PlannedNote {
  raw: RawNote;
  context: ObsidianVaultNote;
  key: string;
  memory?: Memory;
  content: string;
  title: string;
  type: Memory["type"];
  inputDigest: string;
  action: "create" | "update" | "unchanged" | "store";
}

async function readNote(path: string, vault: string): Promise<string> {
  const confined = await confinePath(path, [obsidianExportRoot()]);
  if (!confined.ok) throw new Error("note is outside export root");
  const before = await lstat(path);
  if (before.isSymbolicLink() || !before.isFile()) throw new Error("note must be a regular file, not a symlink");
  const canonical = await realpath(path);
  const withinVault = relative(vault, canonical);
  if (withinVault === ".." || withinVault.startsWith(`..${sep}`) || isAbsolute(withinVault) || withinVault === "") {
    throw new Error("note is outside this vault");
  }
  const handle = await open(canonical, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size > MAX_NOTE_BYTES) {
      throw new Error("note changed during discovery or exceeds the 2 MiB limit");
    }
    const bytes = Buffer.alloc(MAX_NOTE_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(bytes, length, bytes.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const after = await lstat(canonical);
    const checked = await confinePath(canonical, [obsidianExportRoot()]);
    if (length > MAX_NOTE_BYTES || !checked.ok || after.isSymbolicLink() ||
        after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size ||
        after.mtimeMs !== opened.mtimeMs || await realpath(path) !== canonical) {
      throw new Error("note changed while being read");
    }
    return normalizedNote(bytes.subarray(0, length).toString("utf8"));
  } finally {
    await handle.close();
  }
}

async function discoverNotes(vault: string): Promise<string[]> {
  const notes: string[] = [];
  let entries = 0;
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 32) throw new Error("memory folder exceeds the 32-level depth limit");
    const info = await lstat(dir);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("memory directories must not be symlinks");
    if (!(await confinePath(dir, [obsidianExportRoot()])).ok) throw new Error("memory folder is outside export root");
    for await (const entry of await opendir(dir)) {
      if (++entries > MAX_ENTRIES) throw new Error("memory folder exceeds the 10000-entry limit");
      const name = entry.name;
      const path = join(dir, name);
      const child = await lstat(path);
      if (child.isSymbolicLink()) throw new Error("memory folder contains a symlink");
      if (child.isDirectory()) await walk(path, depth + 1);
      else if (child.isFile() && name.toLowerCase().endsWith(".md")) notes.push(path);
    }
  }
  try { await lstat(join(vault, "memories")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return [];
  }
  await walk(join(vault, "memories"), 0);
  return notes.sort();
}

function parseNote(path: string, vault: string, text: string): RawNote {
  let markdown = text;
  let fields: Record<string, unknown> = {};
  if (text.startsWith("---\n")) {
    const end = text.indexOf("\n---", 4);
    if (end < 0 || end > 65_536 || !/^\n---(?:\n|$)/.test(text.slice(end))) throw new Error("invalid frontmatter");
    const document = parseDocument(text.slice(4, end), { uniqueKeys: true });
    if (document.errors.length || document.warnings.length) throw new Error("invalid or unsupported YAML frontmatter");
    let parsed: unknown;
    try { parsed = document.toJS({ maxAliasCount: 0 }); }
    catch { throw new Error("frontmatter aliases are not supported"); }
    if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed))) throw new Error("frontmatter must be a mapping");
    fields = (parsed ?? {}) as Record<string, unknown>;
    markdown = text.slice(end + 4).replace(/^\n/, "");
  }
  for (const key of Object.keys(fields)) {
    if (!FRONTMATTER_FIELDS.has(key)) throw new Error("unsupported frontmatter field");
    const value = fields[key];
    if (["id", "type", "created", "updated"].includes(key) && (typeof value !== "string" || !value.trim())) {
      throw new Error("frontmatter identity, type and timestamps must be non-empty strings");
    }
    if (["strength", "version"].includes(key) && (typeof value !== "number" || !Number.isFinite(value))) {
      throw new Error("frontmatter strength and version must be numbers");
    }
    if (["concepts", "files"].includes(key) && (!Array.isArray(value) || !value.every(v => typeof v === "string"))) {
      throw new Error("frontmatter concepts and files must be string arrays");
    }
  }
  if (fields.type !== undefined && !MEMORY_TYPES.has(fields.type as string)) throw new Error("unsupported memory type");
  return { path, file: relative(vault, path), digest: vaultDigest(text), fields, markdown: markdown.replace(/^\n/, "") };
}

function latestDescendant(anchor: string, memories: Map<string, Memory>): Memory {
  const latest = [...memories.values()].filter(candidate => {
    if (candidate.isLatest === false) return false;
    const seen = new Set<string>();
    let current: Memory | undefined = candidate;
    while (current && !seen.has(current.id)) {
      if (current.id === anchor) return true;
      seen.add(current.id);
      current = current.parentId ? memories.get(current.parentId) : undefined;
    }
    return false;
  });
  if (latest.length !== 1) throw new Error("memory has no unique latest descendant; resolve its lineage first");
  return latest[0];
}

function noteContent(raw: RawNote, descriptor?: ObsidianVaultNote["exported"]): { title: string; content: string } {
  let text = raw.markdown;
  let title: string;
  if (descriptor && text.startsWith("# ") &&
      text.slice(2 + descriptor.titleLength, 4 + descriptor.titleLength) === "\n\n" &&
      vaultDigest(text.slice(2, 2 + descriptor.titleLength)) === descriptor.titleDigest) {
    title = text.slice(2, 2 + descriptor.titleLength);
    text = text.slice(4 + descriptor.titleLength);
  } else {
    if (descriptor?.multilineTitle) throw new Error("edited multiline export title is ambiguous; keep the original title intact");
    const heading = /^# ([^\n]+)(?:\n\n|\n?$)/.exec(text);
    if (!heading && descriptor) throw new Error("exported note must retain an unambiguous H1 title");
    title = heading ? heading[1] : basename(raw.path, ".md");
    if (heading) text = text.slice(heading[0].length);
  }
  if (descriptor && descriptor.tailLength > 0) {
    const tail = text.slice(-descriptor.tailLength);
    if (tail.length !== descriptor.tailLength || vaultDigest(tail) !== descriptor.tailDigest) {
      throw new Error("generated trailing sections changed; their boundary is ambiguous");
    }
    text = text.slice(0, -descriptor.tailLength);
  }
  title = stripPrivateData(title);
  const content = stripPrivateData(text);
  if (!title.trim() || !content.trim()) throw new Error("note title and content must remain non-empty after privacy scrubbing");
  return { title, content };
}

export function registerObsidianImportFunction(sdk: IIIClient, kv: StateKV): void {
  sdk.registerFunction("mem::obsidian-import", async (data: unknown): Promise<ObsidianImportResult> => {
    const result: ObsidianImportResult = {
      success: false, dryRun: false, planned: { creates: 0, updates: 0, unchanged: 0 },
      applied: { created: 0, updated: 0 }, conflicts: [], warnings: [], errors: [], files: [],
    };
    const fail = (error: string, file?: string, details: { memoryId?: string; writeOutcomeUncertain?: boolean } = {}): void => {
      result.errors.push({ ...(file ? { file: stripPrivateData(file) } : {}), error, ...details });
    };
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      fail("payload must be an object"); return result;
    }
    const input = data as Record<string, unknown>;
    if (typeof input.vaultDir !== "string" || !input.vaultDir.trim() ||
        (input.dryRun !== undefined && typeof input.dryRun !== "boolean") ||
        (input.prefer !== undefined && input.prefer !== "vault" && input.prefer !== "store")) {
      fail("vaultDir is required; dryRun must be boolean and prefer must be vault or store"); return result;
    }
    result.dryRun = input.dryRun === true;
    const prefer = input.prefer === "store" ? "store" : "vault";
    try {
      const confined = await confinePath(input.vaultDir, [obsidianExportRoot()]);
      if (!confined.ok) { fail("vaultDir must be inside export root"); return result; }
      const vault = await realpath(confined.path);
      return await withKeyedLock(`mem:obsidian:${vaultDigest(vault)}`, async () => {
        const paths = await discoverNotes(vault);
        const rawNotes: RawNote[] = [];
        let bytes = 0;
        for (const path of paths) {
          try {
            const text = await readNote(path, vault);
            bytes += Buffer.byteLength(text);
            if (bytes > MAX_VAULT_BYTES) { fail("vault exceeds the 64 MiB import limit"); break; }
            rawNotes.push(parseNote(path, vault, text));
          } catch (error) { fail(error instanceof Error ? error.message : "could not read note", relative(vault, path)); }
        }
        const rawIds = new Set<string>();
        for (const note of rawNotes) {
          const id = note.fields.id as string | undefined;
          if (id && rawIds.has(id)) fail("duplicate memory ID in vault", note.file);
          if (id) rawIds.add(id);
        }
        if (result.errors.length) return result;
        const memories = new Map((await collectAll<Memory>(kv, KV.memories)).map(m => [m.id, m]));
        const contexts = (await collectAll<ObsidianVaultNote>(kv, KV.obsidianNotes))
          .filter(c => c.version === 1 && c.vaultHash === vaultDigest(vault));
        const plan: PlannedNote[] = [];
        for (const raw of rawNotes) {
          try {
            const identity = noteIdentity(vault, raw.file);
            const rawId = raw.fields.id as string | undefined;
            let context = await kv.get<ObsidianVaultNote>(KV.obsidianNotes, identity.key);
            if (context && (context.version !== 1 || context.vaultHash !== identity.vaultHash || context.noteHash !== identity.noteHash)) {
              throw new Error("note provenance does not match this vault path");
            }
            if (!context && rawId) {
              const matches = contexts.filter(c => c.exported?.memoryId === rawId);
              if (new Set(matches.map(c => JSON.stringify(c.exported))).size > 1) throw new Error("export context is ambiguous for this ID");
              if (matches[0]) context = {
                ...matches[0], vaultHash: identity.vaultHash, noteHash: identity.noteHash,
              };
            }
            context ??= { version: 1, vaultHash: identity.vaultHash, noteHash: identity.noteHash };
            if (context.exported && context.exported.memoryId !== rawId) throw new Error("exported note ID was changed or removed");
            if (context.imported && context.imported.rawId !== rawId) throw new Error("imported note ID was changed");
            const anchor = rawId ?? context.imported?.memoryId;
            const base = anchor ? memories.get(anchor) : undefined;
            if (anchor && !base) throw new Error("unknown memory ID; it cannot be created or remapped");
            if (!rawId && Object.keys(raw.fields).some(key => key !== "type")) throw new Error("new notes only support type frontmatter");
            const descriptor = rawId && base
              ? context.exported ?? exportedNoteContext(vault, raw.file, base, memoryMarkdownTail(base)).exported
              : undefined;
            if (descriptor) {
              let readonlyFields = raw.fields;
              if (!context.exported && base) {
                readonlyFields = { ...raw.fields, updated: base.updatedAt, strength: base.strength };
                const mutableFields = ["updated", "strength"].filter(field =>
                  raw.fields[field] !== (field === "updated" ? base.updatedAt : base.strength));
                result.warnings.push({
                  file: stripPrivateData(raw.file), code: "legacy_export_context", mutableFields,
                  message: "Legacy export has no saved snapshot. Mutable readonly metadata cannot be verified and is not applied; identity and generated sections are checked against the stored version.",
                });
              }
              if (readonlyNoteDigest(readonlyFields) !== descriptor.readonlyDigest) {
                throw new Error("unsupported metadata edit or unproven original export metadata");
              }
            }
            const { title, content } = noteContent(raw, descriptor);
            const type = (raw.fields.type ?? base?.type ?? "fact") as Memory["type"];
            const inputDigest = noteStateDigest({ title, content, type });
            const memory = base ? latestDescendant(base.id, memories) : undefined;
            let action: PlannedNote["action"] = "create";
            if (memory && base) {
              const originalDigest = context.imported?.inputDigest ?? descriptor?.stateDigest ?? noteStateDigest(base);
              const storeDigest = noteStateDigest(memory);
              const baselineStore = context.imported?.stateDigest ?? descriptor?.stateDigest ?? noteStateDigest(base);
              if (inputDigest === originalDigest || inputDigest === storeDigest) action = "unchanged";
              else {
                action = "update";
                if (storeDigest !== baselineStore) {
                  result.conflicts.push({ file: stripPrivateData(raw.file), memoryId: base.id, storeId: memory.id, prefer });
                  if (prefer === "store") action = "store";
                }
              }
            }
            plan.push({ raw, context, key: identity.key, memory, title, content, type, inputDigest, action });
          } catch (error) { fail(error instanceof Error ? error.message : "could not plan note", raw.file); }
        }
        const updateHeads = new Set<string>();
        for (const item of plan) {
          if (item.action === "update" && item.memory) {
            if (updateHeads.has(item.memory.id)) fail("multiple changed notes target the same memory lineage", item.raw.file);
            updateHeads.add(item.memory.id);
          }
          if (item.action === "create") result.planned.creates++;
          else if (item.action === "update") result.planned.updates++;
          else result.planned.unchanged++;
          result.files.push({ file: stripPrivateData(item.raw.file), action: item.action, ...(item.memory ? { memoryId: item.memory.id } : {}) });
        }
        if (result.errors.length) return result;
        if (!result.dryRun) {
          for (const [index, item] of plan.entries()) {
            if (item.action !== "create" && item.action !== "update") continue;
            let stage: "read" | "write" | "provenance" = "read";
            let writtenId: string | undefined;
            try {
              if (vaultDigest(await readNote(item.raw.path, vault)) !== item.raw.digest) throw new Error("note changed since import planning");
              stage = "write";
              const response = await sdk.trigger({
                function_id: item.action === "create" ? "mem::remember" : "mem::evolve",
                payload: item.action === "create"
                  ? { title: item.title, content: item.content, type: item.type }
                  : { memoryId: item.memory!.id, newTitle: item.title, newContent: item.content,
                    newType: item.type, expectedState: memoryWriteToken(item.memory!) },
              }) as { success?: boolean; memory?: Memory; error?: string; code?: string };
              if (!response.success || !response.memory) {
                const preconditionFailure = ["state_changed", "not_latest", "not_found", "unchanged"].includes(response.code ?? "");
                fail(response.code === "state_changed" || response.code === "not_latest"
                  ? "store changed since import planning; nothing was overwritten"
                  : "registered memory write did not succeed; inspect the store before retrying", item.raw.file,
                  preconditionFailure ? {} : { writeOutcomeUncertain: true });
                break;
              }
              if (item.action === "create") result.applied.created++;
              else result.applied.updated++;
              writtenId = response.memory.id;
              result.files[index].appliedMemoryId = writtenId;
              stage = "provenance";
              await kv.set<ObsidianVaultNote>(KV.obsidianNotes, item.key, {
                ...item.context,
                imported: {
                  memoryId: response.memory.id, rawId: item.raw.fields.id as string | undefined,
                  inputDigest: item.inputDigest, stateDigest: noteStateDigest(response.memory),
                },
              });
            } catch {
              if (stage === "provenance") {
                fail("memory was saved but note provenance failed; inspect this memory before retrying", item.raw.file, { memoryId: writtenId });
              } else if (stage === "write") {
                fail("registered write response was lost; its outcome is uncertain. Inspect the store before retrying", item.raw.file, { writeOutcomeUncertain: true });
              } else fail("note could not be re-read or changed since planning; it was not imported", item.raw.file);
              break;
            }
          }
          if (result.applied.created + result.applied.updated > 0) {
            await safeAudit(kv, "obsidian_import", "mem::obsidian-import", [], {
              ...result.applied, conflicts: result.conflicts.length, errors: result.errors.length,
            });
          }
        }
        result.success = result.errors.length === 0;
        return result;
      });
    } catch { fail("could not read a confined vault; no implicit filesystem or engine setup is performed"); return result; }
  });
}
