import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { Memory, ObsidianVaultNote } from "../types.js";
import { fingerprintId } from "../state/schema.js";
import { stripPrivateData } from "./privacy.js";

export function obsidianExportRoot(): string {
  return resolve(process.env["AGENTMEMORY_EXPORT_ROOT"] || join(homedir(), ".agentmemory"));
}

export function vaultDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizedNote(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

export function noteIdentity(vault: string, relativePath: string): {
  key: string; vaultHash: string; noteHash: string;
} {
  const vaultHash = vaultDigest(vault);
  const noteHash = vaultDigest(relativePath.split(sep).join("/"));
  return { key: fingerprintId("obsidian", `${vaultHash}:${noteHash}`), vaultHash, noteHash };
}

export function noteStateDigest(memory: Pick<Memory, "content" | "title" | "type"> & { id?: string }): string {
  return vaultDigest(JSON.stringify([
    stripPrivateData(normalizedNote(typeof memory.title === "string" ? memory.title : memory.id ?? "")),
    stripPrivateData(normalizedNote(typeof memory.content === "string" ? memory.content : "")), memory.type,
  ]));
}

export function readonlyNoteDigest(fields: Record<string, unknown>): string {
  return vaultDigest(JSON.stringify([
    fields.id, fields.created, fields.updated, fields.strength,
    fields.version, fields.concepts, fields.files,
  ]));
}

export function exportedNoteContext(
  vault: string, relativePath: string, memory: Memory, tail: string,
): ObsidianVaultNote {
  const { vaultHash, noteHash } = noteIdentity(vault, relativePath);
  const title = normalizedNote(typeof memory.title === "string" ? memory.title : memory.id);
  tail = normalizedNote(tail);
  return {
    version: 1, vaultHash, noteHash,
    exported: {
      memoryId: memory.id,
      readonlyDigest: readonlyNoteDigest({
        id: memory.id, created: memory.createdAt, updated: memory.updatedAt,
        strength: memory.strength, version: memory.version,
        concepts: Array.isArray(memory.concepts) ? memory.concepts : [],
        files: Array.isArray(memory.files) ? memory.files : [],
      }),
      titleDigest: vaultDigest(title), titleLength: title.length,
      multilineTitle: title.includes("\n"),
      tailDigest: vaultDigest(tail), tailLength: tail.length,
      stateDigest: noteStateDigest(memory),
    },
  };
}
