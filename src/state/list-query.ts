export const LIST_PAGE_MAX = 500;

export interface ListQuery {
  limit?: number;
  cursor?: string;
  project?: string;
  type?: string;
  status?: string;
  q?: string;
}

type QueryParams = Record<string, string | string[] | undefined> | undefined;

function firstParam(params: QueryParams, name: string): string | undefined {
  const raw = params?.[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseListQuery(params: QueryParams): ListQuery {
  const rawLimit = firstParam(params, "limit");
  const parsedLimit = rawLimit === undefined ? Number.NaN : Number(rawLimit);
  return {
    limit:
      Number.isFinite(parsedLimit) && parsedLimit >= 1
        ? Math.min(Math.floor(parsedLimit), LIST_PAGE_MAX)
        : undefined,
    cursor: firstParam(params, "cursor"),
    project: firstParam(params, "project"),
    type: firstParam(params, "type"),
    status: firstParam(params, "status"),
    q: firstParam(params, "q"),
  };
}

interface CursorPosition {
  key?: string;
  id?: string;
  offset?: number;
}

export function encodeCursor(position: CursorPosition): string {
  return Buffer.from(JSON.stringify(position), "utf-8").toString("base64url");
}

export function decodeCursor(cursor: string | undefined): CursorPosition | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
    if (!parsed || typeof parsed !== "object") return null;
    const position: CursorPosition = {};
    if (typeof parsed.key === "string") position.key = parsed.key;
    if (typeof parsed.id === "string") position.id = parsed.id;
    if (Number.isInteger(parsed.offset) && parsed.offset >= 0) position.offset = parsed.offset;
    return position;
  } catch {
    return null;
  }
}

function compareDesc(aKey: string, aId: string, bKey: string, bId: string): number {
  if (aKey !== bKey) return aKey < bKey ? 1 : -1;
  if (aId === bId) return 0;
  return aId < bId ? 1 : -1;
}

export function sortByKeyDesc<T>(items: T[], keyOf: (item: T) => string, idOf: (item: T) => string): T[] {
  return items.sort((a, b) => compareDesc(keyOf(a), idOf(a), keyOf(b), idOf(b)));
}

export function pageAfterCursor<T>(
  sortedDesc: T[],
  keyOf: (item: T) => string,
  idOf: (item: T) => string,
  cursor: string | undefined,
  limit: number,
): { page: T[]; nextCursor: string | null } {
  const position = decodeCursor(cursor);
  let start = 0;
  if (position?.key !== undefined && position.id !== undefined) {
    const { key, id } = position;
    start = sortedDesc.findIndex((item) => compareDesc(keyOf(item), idOf(item), key, id) > 0);
    if (start < 0) start = sortedDesc.length;
  }
  const page = sortedDesc.slice(start, start + limit);
  const last = page[page.length - 1];
  const nextCursor =
    last !== undefined && start + limit < sortedDesc.length
      ? encodeCursor({ key: keyOf(last), id: idOf(last) })
      : null;
  return { page, nextCursor };
}

export function pageByOffset<T>(
  ordered: T[],
  cursor: string | undefined,
  limit: number,
): { page: T[]; nextCursor: string | null } {
  const start = decodeCursor(cursor)?.offset ?? 0;
  const page = ordered.slice(start, start + limit);
  const nextCursor =
    start + limit < ordered.length ? encodeCursor({ offset: start + limit }) : null;
  return { page, nextCursor };
}

export function matchesText(q: string | undefined, ...fields: Array<string | undefined | null>): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return fields.some((field) => typeof field === "string" && field.toLowerCase().includes(needle));
}
