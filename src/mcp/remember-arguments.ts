export interface RememberFields {
  concepts: string[];
  files: string[];
  ttlDays?: number;
  sourceObservationIds?: string[];
}

const MAX_DATE_MS = 8.64e15;
const DAY_MS = 86_400_000;

export const TTL_TOO_LARGE = "ttlDays is too large: the expiry date cannot be represented";

export function ttlExpiry(ttlDays: number, now = Date.now()): string | null {
  const ms = now + ttlDays * DAY_MS;
  return Number.isFinite(ms) && ms <= MAX_DATE_MS ? new Date(ms).toISOString() : null;
}

export function normalizeStringList(value: unknown): string[] {
  const items = typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : [];
  return items
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function positiveNumber(value: unknown): number | undefined {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
}

function isStringListInput(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

export function rememberFieldsError(args: Record<string, unknown>): string | undefined {
  for (const field of ["concepts", "files"] as const) {
    if (!isStringListInput(args[field])) return `${field} must be a comma-separated string or an array of strings`;
  }
  const sourceIds = args.sourceObservationIds;
  if (sourceIds !== undefined && sourceIds !== null && !Array.isArray(sourceIds)) {
    return "sourceObservationIds must be an array";
  }
  const ttlDays = positiveNumber(args.ttlDays);
  if (ttlDays !== undefined && ttlExpiry(ttlDays) === null) return TTL_TOO_LARGE;
  return undefined;
}

export function normalizeRememberFields(args: Record<string, unknown>): RememberFields {
  const ttlDays = positiveNumber(args.ttlDays);
  const sourceObservationIds = Array.isArray(args.sourceObservationIds)
    ? normalizeStringList(args.sourceObservationIds)
    : [];
  return {
    concepts: normalizeStringList(args.concepts),
    files: normalizeStringList(args.files),
    ...(ttlDays !== undefined && { ttlDays }),
    ...(sourceObservationIds.length > 0 && { sourceObservationIds }),
  };
}
