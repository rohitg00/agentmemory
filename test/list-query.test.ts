import { describe, it, expect } from "vitest";
import {
  LIST_PAGE_MAX,
  decodeCursor,
  encodeCursor,
  matchesText,
  pageAfterCursor,
  pageByOffset,
  parseListQuery,
  sortByKeyDesc,
} from "../src/state/list-query.js";

type Row = { id: string; at: string };
const keyOf = (r: Row) => r.at;
const idOf = (r: Row) => r.id;

function rows(): Row[] {
  return sortByKeyDesc(
    [
      { id: "a", at: "2026-01-01" },
      { id: "b", at: "2026-01-03" },
      { id: "c", at: "2026-01-02" },
      { id: "d", at: "2026-01-03" },
      { id: "e", at: "2026-01-05" },
    ],
    keyOf,
    idOf,
  );
}

describe("list query helpers", () => {
  it("parses filters and clamps the page size", () => {
    const q = parseListQuery({ limit: "9999", project: " web ", type: "fact", q: "  ", cursor: "abc", status: "active" });
    expect(q).toEqual({ limit: LIST_PAGE_MAX, cursor: "abc", project: "web", type: "fact", status: "active", q: undefined });
    expect(parseListQuery({ limit: "0" }).limit).toBeUndefined();
    expect(parseListQuery({ limit: "abc" }).limit).toBeUndefined();
    expect(parseListQuery(undefined)).toEqual({});
  });

  it("sorts newest first with id as the tiebreak", () => {
    expect(rows().map((r) => r.id)).toEqual(["e", "d", "b", "c", "a"]);
  });

  it("walks every row exactly once across cursor pages", () => {
    const sorted = rows();
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 10; i++) {
      const { page, nextCursor } = pageAfterCursor(sorted, keyOf, idOf, cursor, 2);
      seen.push(...page.map((r) => r.id));
      if (!nextCursor) break;
      cursor = nextCursor;
    }
    expect(seen).toEqual(["e", "d", "b", "c", "a"]);
  });

  it("keeps the next page stable when a newer row arrives between requests", () => {
    const first = pageAfterCursor(rows(), keyOf, idOf, undefined, 2);
    const grown = sortByKeyDesc([...rows(), { id: "z", at: "2026-02-01" }], keyOf, idOf);
    const second = pageAfterCursor(grown, keyOf, idOf, first.nextCursor ?? undefined, 2);
    expect(second.page.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("pages by offset for relevance-ordered results", () => {
    const ordered = ["x", "y", "z"];
    const first = pageByOffset(ordered, undefined, 2);
    expect(first.page).toEqual(["x", "y"]);
    const second = pageByOffset(ordered, first.nextCursor ?? undefined, 2);
    expect(second).toEqual({ page: ["z"], nextCursor: null });
  });

  it("ignores malformed cursors", () => {
    expect(decodeCursor("not-base64-json")).toBeNull();
    expect(decodeCursor(encodeCursor({ offset: -1 }))).toEqual({});
    expect(pageAfterCursor(rows(), keyOf, idOf, "garbage", 2).page.map((r) => r.id)).toEqual(["e", "d"]);
  });

  it("matches text case-insensitively across fields", () => {
    expect(matchesText("AUTH", "fix auth bug", undefined)).toBe(true);
    expect(matchesText("auth", null, "other")).toBe(false);
    expect(matchesText(undefined, "anything")).toBe(true);
  });
});
