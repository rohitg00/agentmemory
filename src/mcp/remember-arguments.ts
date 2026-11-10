export interface RememberFields {
  concepts: string[];
  files: string[];
  ttlDays?: number;
  sourceObservationIds?: string[];
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
