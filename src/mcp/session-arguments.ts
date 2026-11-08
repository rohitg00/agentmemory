import { decodeCursor } from "../state/list-query.js";

export function parseSessionArguments(args: Record<string, unknown>): Record<string, string> {
  const limit = args.limit === undefined ? 20 : args.limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1) {
    throw new Error("limit must be a positive integer");
  }
  const query: Record<string, string> = { limit: String(Math.min(limit, 100)) };
  for (const field of ["project", "agentId", "cursor"] as const) {
    if (args[field] === undefined) continue;
    if (field === "cursor" && typeof args[field] === "string" && !args[field].trim()) continue;
    if (typeof args[field] !== "string" || !args[field].trim()) {
      throw new Error(`${field} must be a non-empty string`);
    }
    query[field] = args[field].trim();
  }
  if (query.cursor) {
    const position = decodeCursor(query.cursor);
    if (!position || typeof position.key !== "string" || typeof position.id !== "string") {
      throw new Error("cursor must be a session continuation token");
    }
  }
  return query;
}
