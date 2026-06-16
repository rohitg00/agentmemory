export class TimeRangeError extends Error {
  constructor(
    message: string,
    readonly code = "invalid_time_range",
  ) {
    super(message);
    this.name = "TimeRangeError";
  }
}

export type TimeRange = {
  start?: number;
  end?: number;
};

export type TimeRangeInput = {
  start_time?: unknown;
  end_time?: unknown;
};

export function parseTimeRange(input: TimeRangeInput | null | undefined): TimeRange | null {
  if (!input) return null;
  const start = parseTimeBound(input.start_time, "start_time");
  const end = parseTimeBound(input.end_time, "end_time");
  if (start === undefined && end === undefined) return null;
  if (start !== undefined && end !== undefined && start > end) {
    throw new TimeRangeError("start_time must be <= end_time", "start_after_end");
  }
  return { start, end };
}

export function inTimeRange(timestamp: unknown, range: TimeRange | null): boolean {
  if (!range) return true;
  if (typeof timestamp !== "string" || timestamp.trim().length === 0) return false;
  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) return false;
  if (range.start !== undefined && ms < range.start) return false;
  if (range.end !== undefined && ms > range.end) return false;
  return true;
}

export function filterSessionsByTime<T extends { startedAt?: unknown; endedAt?: unknown }>(
  sessions: T[],
  range: TimeRange | null,
): T[] {
  const sorted = [...sessions].sort(byStartedAtDesc);
  if (!range) return sorted;

  const nowMs = Date.now();
  return sorted.filter((session) => {
    if (typeof session.startedAt !== "string" || session.startedAt.trim().length === 0) {
      return false;
    }
    const startMs = Date.parse(session.startedAt);
    if (Number.isNaN(startMs)) return false;

    let endMs = nowMs;
    if (typeof session.endedAt === "string" && session.endedAt.trim().length > 0) {
      const parsedEnd = Date.parse(session.endedAt);
      endMs = Number.isNaN(parsedEnd) ? nowMs : parsedEnd;
    }

    if (range.start !== undefined && endMs < range.start) return false;
    if (range.end !== undefined && startMs > range.end) return false;
    return true;
  });
}

function parseTimeBound(value: unknown, field: "start_time" | "end_time"): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new TimeRangeError(`${field} must be an ISO 8601 string`, "not_a_string");
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) {
    throw new TimeRangeError(
      `${field} is not a valid ISO 8601 datetime`,
      "unparseable",
    );
  }
  return ms;
}

function byStartedAtDesc<T extends { startedAt?: unknown }>(a: T, b: T): number {
  const aStarted = typeof a.startedAt === "string" ? a.startedAt : "";
  const bStarted = typeof b.startedAt === "string" ? b.startedAt : "";
  return bStarted.localeCompare(aStarted);
}
