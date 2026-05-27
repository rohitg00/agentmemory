export function countSessionObservations(
  sessions: Array<{ observationCount?: unknown }> | undefined,
): number {
  if (!Array.isArray(sessions)) return 0;
  return sessions.reduce((sum, session) => {
    const value = session?.observationCount;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      return sum;
    }
    return sum + Math.floor(value);
  }, 0);
}

export function countMemories(
  response: { total?: unknown; memories?: unknown } | undefined,
): number {
  if (!response || typeof response !== "object") return 0;
  if (
    typeof response.total === "number" &&
    Number.isFinite(response.total) &&
    response.total >= 0
  ) {
    return Math.floor(response.total);
  }
  return Array.isArray(response.memories) ? response.memories.length : 0;
}
