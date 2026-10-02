import { createHash } from "node:crypto";

export const EVENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;

const HOST_ID_FIELDS = [
  "event_id",
  "eventId",
  "tool_use_id",
  "toolUseId",
  "tool_call_id",
  "toolCallId",
  "call_id",
  "callId",
  "prompt_id",
  "promptId",
  "message_id",
  "messageId",
];

const HOST_TIME_FIELDS = ["timestamp", "ts", "created_at", "createdAt", "event_time"];

export function isValidEventId(value: unknown): value is string {
  return typeof value === "string" && EVENT_ID_RE.test(value);
}

export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    return encoded === undefined ? "null" : encoded;
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function hostScalar(host: Record<string, unknown>, fields: string[]): string | undefined {
  for (const field of fields) {
    const v = host[field];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function digest(parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 32);
}

export function hasHostIdentity(host: Record<string, unknown> | null | undefined): boolean {
  const source = host && typeof host === "object" ? host : {};
  return hostScalar(source, HOST_ID_FIELDS) !== undefined || hostScalar(source, HOST_TIME_FIELDS) !== undefined;
}

export function deriveEventId(
  hookType: string,
  sessionId: string,
  host: Record<string, unknown> | null | undefined,
  content: unknown,
): string {
  const source = host && typeof host === "object" ? host : {};
  const hostId = hostScalar(source, HOST_ID_FIELDS);
  if (hostId) return `evh_${digest(["host", sessionId, hookType, hostId])}`;
  const hostTime = hostScalar(source, HOST_TIME_FIELDS) ?? "";
  return `evc_${digest(["content", sessionId, hookType, hostTime, stableStringify(content)])}`;
}
