export type SearchExpansionId = string | { obsId: string; sessionId: string };

export function parseSearchExpansionIds(value: unknown): SearchExpansionId[] {
  const entries = typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : [];
  return entries.flatMap((entry): SearchExpansionId[] => {
    if (typeof entry === "string") return entry.trim() ? [entry.trim()] : [];
    if (!entry || typeof entry !== "object" || typeof entry.obsId !== "string" || !entry.obsId.trim()) return [];
    const obsId = entry.obsId.trim();
    return typeof entry.sessionId === "string" && entry.sessionId.trim()
      ? [{ obsId, sessionId: entry.sessionId.trim() }]
      : [obsId];
  });
}
