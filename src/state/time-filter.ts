// Shared time-range filter for memory_recall, memory_smart_search, and
// memory_sessions (issue #392). Used by:
//   - mem::search (memory_recall)
//   - mem::smart-search (memory_smart_search)
//   - api::sessions / MCP memory_sessions handler
//
// Contract:
//   - start_time / end_time are optional ISO 8601 strings.
//   - Both bounds are inclusive: start_time <= ts <= end_time.
//   - If both are omitted the range is "unbounded" and matches everything.
//   - Date-only strings ("2026-05-01") parse to UTC midnight, matching the
//     standard ISO 8601 semantics that Date.parse implements.
//   - Errors produced here are TimeRangeError and carry an HTTP-friendly
//     `code` so api triggers and MCP tool handlers can return uniform 400s.

export class TimeRangeError extends Error {
  readonly code: string;
  constructor(message: string, code = "invalid_time_range") {
    super(message);
    this.name = "TimeRangeError";
    this.code = code;
  }
}

export interface TimeRange {
  /** Lower bound (inclusive), epoch milliseconds. Undefined means unbounded. */
  start?: number;
  /** Upper bound (inclusive), epoch milliseconds. Undefined means unbounded. */
  end?: number;
}

export interface TimeRangeInput {
  start_time?: unknown;
  end_time?: unknown;
}

/**
 * Validate and normalize a {start_time, end_time} pair.
 *
 * Returns `null` when both inputs are missing or empty (callers can skip the
 * filter entirely). Throws TimeRangeError when an input is present but
 * unparseable, or when start_time > end_time.
 */
export function parseTimeRange(input: TimeRangeInput | undefined | null): TimeRange | null {
  if (!input) return null;

  const start = parseBound(input.start_time, "start_time");
  const end = parseBound(input.end_time, "end_time");

  if (start === undefined && end === undefined) return null;
  if (start !== undefined && end !== undefined && start > end) {
    throw new TimeRangeError(
      "start_time must be <= end_time",
      "start_after_end",
    );
  }
  return { start, end };
}

function parseBound(value: unknown, field: "start_time" | "end_time"): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new TimeRangeError(`${field} must be an ISO 8601 string`, "not_a_string");
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    throw new TimeRangeError(
      `${field} is not a valid ISO 8601 datetime: ${JSON.stringify(trimmed)}`,
      "unparseable",
    );
  }
  return ms;
}

/**
 * Test whether an ISO timestamp falls inside a normalized range.
 *
 * Defensive against malformed timestamps in the store: a row with a missing
 * or unparseable timestamp is treated as out-of-range when *any* bound is
 * set (it would otherwise silently slip through). When `range` is null the
 * predicate is the identity true — callers should short-circuit instead of
 * calling this in the hot path, but it stays correct either way.
 */
export function inTimeRange(timestamp: string | undefined, range: TimeRange | null): boolean {
  if (!range) return true;
  if (typeof timestamp !== "string" || timestamp.length === 0) return false;
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) return false;
  if (range.start !== undefined && ms < range.start) return false;
  if (range.end !== undefined && ms > range.end) return false;
  return true;
}

/**
 * Filter a session list by overlap with `range`. A session is in-range when
 * its lifetime [startedAt, endedAt ?? now) intersects the bounded window —
 * this matches user intent ("show me sessions from May 1-7" should include a
 * session that started April 30 and ended May 2).
 *
 * Sessions are returned in descending startedAt order (most recent first),
 * which is what every existing caller expects.
 */
export function filterSessionsByTime<T extends { startedAt: string; endedAt?: string }>(
  sessions: T[],
  range: TimeRange | null,
): T[] {
  if (!range) return [...sessions].sort(byStartedAtDesc);

  const filtered: T[] = [];
  for (const s of sessions) {
    if (typeof s.startedAt !== "string" || s.startedAt.length === 0) continue;
    const startMs = Date.parse(s.startedAt);
    if (Number.isNaN(startMs)) continue;
    let endMs: number;
    if (typeof s.endedAt === "string" && s.endedAt.length > 0) {
      const parsed = Date.parse(s.endedAt);
      endMs = Number.isNaN(parsed) ? Date.now() : parsed;
    } else {
      // Active sessions have no endedAt; treat as "still running".
      endMs = Date.now();
    }
    // Half-open lifetime overlap with closed [start, end] window.
    if (range.start !== undefined && endMs < range.start) continue;
    if (range.end !== undefined && startMs > range.end) continue;
    filtered.push(s);
  }
  return filtered.sort(byStartedAtDesc);
}

function byStartedAtDesc<T extends { startedAt: string }>(a: T, b: T): number {
  // Pure string compare on ISO 8601 is byte-equivalent to chronological
  // compare for any well-formed input, so we avoid the parse cost on the
  // common path. Fall back to 0 when both are missing/equal.
  if (a.startedAt === b.startedAt) return 0;
  return a.startedAt < b.startedAt ? 1 : -1;
}
