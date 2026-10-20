import type { RawObservation } from "../types.js";

export type TimelineEventKind =
  | "prompt"
  | "response"
  | "tool_call"
  | "tool_result"
  | "tool_error"
  | "hook"
  | "session_start"
  | "session_end";

export interface TimelineEvent {
  id: string;
  sessionId: string;
  ts: string;
  offsetMs: number;
  durationMs: number;
  kind: TimelineEventKind;
  label: string;
  body?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
}

export interface Timeline {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  totalDurationMs: number;
  eventCount: number;
  events: TimelineEvent[];
}

const DEFAULT_CHARS_PER_SEC = 40;
const MIN_EVENT_MS = 300;
const MAX_EVENT_MS = 20_000;

function kindFromHook(obs: RawObservation): TimelineEventKind {
  switch (obs.hookType) {
    case "session_start":
      return "session_start";
    case "session_end":
      return "session_end";
    case "prompt_submit":
      return "prompt";
    case "stop":
      return obs.assistantResponse ? "response" : "hook";
    case "pre_tool_use":
      return "tool_call";
    case "post_tool_use":
      return "tool_result";
    case "post_tool_failure":
      return "tool_error";
    default:
      return "hook";
  }
}

function labelFor(obs: RawObservation, kind: TimelineEventKind): string {
  switch (kind) {
    case "prompt":
      return truncate(obs.userPrompt || "User prompt", 80);
    case "response":
      return truncate(obs.assistantResponse || "Assistant response", 80);
    case "tool_call":
      return `${obs.toolName || "tool"} ▸ call`;
    case "tool_result":
      return `${obs.toolName || "tool"} ▸ result`;
    case "tool_error":
      return `${obs.toolName || "tool"} ▸ error`;
    case "session_start":
      return "Session start";
    case "session_end":
      return "Session end";
    default:
      return obs.hookType;
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

function bodyFor(obs: RawObservation, kind: TimelineEventKind): string | undefined {
  if (kind === "prompt") return obs.userPrompt;
  if (kind === "response") return obs.assistantResponse;
  if (kind === "hook" && obs.raw != null) {
    return typeof obs.raw === "string" ? obs.raw : JSON.stringify(obs.raw);
  }
  return undefined;
}

function estimateDurationMs(ev: TimelineEvent): number {
  const chars =
    (ev.body?.length || 0) +
    (typeof ev.toolInput === "string" ? ev.toolInput.length : 0) +
    (typeof ev.toolOutput === "string" ? ev.toolOutput.length : 0);
  if (chars === 0) return MIN_EVENT_MS;
  const ms = Math.round((chars / DEFAULT_CHARS_PER_SEC) * 1000);
  return Math.max(MIN_EVENT_MS, Math.min(MAX_EVENT_MS, ms));
}

export function projectTimeline(observations: RawObservation[]): Timeline {
  if (observations.length === 0) {
    const now = new Date().toISOString();
    return {
      sessionId: "",
      startedAt: now,
      endedAt: now,
      totalDurationMs: 0,
      eventCount: 0,
      events: [],
    };
  }

  const sorted = [...observations].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );

  const startedAt = sorted[0].timestamp;
  const startMs = Date.parse(startedAt);
  const events: TimelineEvent[] = [];

  let syntheticOffset = 0;
  const allSameTs = sorted.every((o) => o.timestamp === startedAt);

  for (const obs of sorted) {
    const kind = kindFromHook(obs);
    const body = bodyFor(obs, kind);
    const obsMs = Date.parse(obs.timestamp);
    const offsetMs = allSameTs
      ? syntheticOffset
      : Number.isFinite(obsMs) && Number.isFinite(startMs)
        ? Math.max(0, obsMs - startMs)
        : syntheticOffset;

    const event: TimelineEvent = {
      id: obs.id,
      sessionId: obs.sessionId,
      ts: obs.timestamp,
      offsetMs,
      durationMs: 0,
      kind,
      label: labelFor(obs, kind),
      body,
      toolName: obs.toolName,
      toolInput: obs.toolInput,
      toolOutput: obs.toolOutput,
    };
    event.durationMs = estimateDurationMs(event);
    events.push(event);
    syntheticOffset += event.durationMs;
  }

  const last = events[events.length - 1];
  const totalDurationMs = last.offsetMs + last.durationMs;

  return {
    sessionId: sorted[0].sessionId,
    startedAt,
    endedAt: sorted[sorted.length - 1].timestamp,
    totalDurationMs,
    eventCount: events.length,
    events,
  };
}
