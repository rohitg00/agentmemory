import { describe, it, expect, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  applyDistinct,
  applyFlatten,
  applyGroupBy,
  applyJoin,
  applyProject,
  applyTopNPerGroup,
  evalPredicate,
  resolveDotPath,
  stableSort,
} from "../src/functions/query.js";
import type { EnvelopedRecord } from "../src/types.js";

function r(overrides: Partial<EnvelopedRecord>): EnvelopedRecord {
  return {
    _kind: "observation",
    _id: "default",
    _source: { op: "test" },
    ...overrides,
  };
}

describe("resolveDotPath", () => {
  it("resolves single key", () => {
    expect(resolveDotPath({ a: 1 }, "a")).toBe(1);
  });
  it("resolves nested path", () => {
    expect(resolveDotPath({ a: { b: { c: 7 } } }, "a.b.c")).toBe(7);
  });
  it("returns undefined for missing intermediate", () => {
    expect(resolveDotPath({ a: { b: 1 } }, "a.c.d")).toBeUndefined();
  });
  it("returns undefined for null intermediate", () => {
    expect(resolveDotPath({ a: null as unknown as Record<string, unknown> }, "a.b")).toBeUndefined();
  });
});

describe("evalPredicate", () => {
  const rec = r({
    _kind: "memory",
    _id: "m1",
    _score: 0.7,
    _createdAt: "2026-05-15T00:00:00Z",
    type: "decision",
    title: "Picked X over Y",
  });

  it("eq", () => {
    expect(evalPredicate({ field: "_kind", op: "eq", value: "memory" }, rec)).toBe(true);
    expect(evalPredicate({ field: "_kind", op: "eq", value: "lesson" }, rec)).toBe(false);
  });
  it("neq", () => {
    expect(evalPredicate({ field: "_kind", op: "neq", value: "lesson" }, rec)).toBe(true);
  });
  it("in / not_in", () => {
    expect(evalPredicate({ field: "type", op: "in", value: ["decision", "pattern"] }, rec)).toBe(true);
    expect(evalPredicate({ field: "type", op: "not_in", value: ["decision"] }, rec)).toBe(false);
  });
  it("gt / gte / lt / lte", () => {
    expect(evalPredicate({ field: "_score", op: "gt", value: 0.5 }, rec)).toBe(true);
    expect(evalPredicate({ field: "_score", op: "gte", value: 0.7 }, rec)).toBe(true);
    expect(evalPredicate({ field: "_score", op: "lt", value: 0.7 }, rec)).toBe(false);
    expect(evalPredicate({ field: "_score", op: "lte", value: 0.7 }, rec)).toBe(true);
  });
  it("contains / starts_with (case insensitive)", () => {
    expect(evalPredicate({ field: "title", op: "contains", value: "PICKED" }, rec)).toBe(true);
    expect(evalPredicate({ field: "title", op: "starts_with", value: "picked" }, rec)).toBe(true);
    expect(evalPredicate({ field: "title", op: "starts_with", value: "over" }, rec)).toBe(false);
  });
  it("exists", () => {
    expect(evalPredicate({ field: "_score", op: "exists" }, rec)).toBe(true);
    expect(evalPredicate({ field: "_project", op: "exists" }, rec)).toBe(false);
  });
  it("since / until", () => {
    expect(evalPredicate({ field: "_createdAt", op: "since", value: "2026-05-01T00:00:00Z" }, rec)).toBe(true);
    expect(evalPredicate({ field: "_createdAt", op: "since", value: "2026-06-01T00:00:00Z" }, rec)).toBe(false);
    expect(evalPredicate({ field: "_createdAt", op: "until", value: "2026-06-01T00:00:00Z" }, rec)).toBe(true);
  });
  it("composes via all/any/not", () => {
    expect(
      evalPredicate(
        {
          all: [
            { field: "_kind", op: "eq", value: "memory" },
            { field: "_score", op: "gt", value: 0.5 },
          ],
        },
        rec,
      ),
    ).toBe(true);
    expect(
      evalPredicate(
        {
          any: [
            { field: "_kind", op: "eq", value: "lesson" },
            { field: "type", op: "eq", value: "decision" },
          ],
        },
        rec,
      ),
    ).toBe(true);
    expect(evalPredicate({ not: { field: "_kind", op: "eq", value: "lesson" } }, rec)).toBe(true);
  });
});

describe("stableSort", () => {
  const data: EnvelopedRecord[] = [
    r({ _id: "a", _score: 1, _createdAt: "2026-01-01T00:00:00Z" }),
    r({ _id: "b", _score: 3, _createdAt: "2026-01-02T00:00:00Z" }),
    r({ _id: "c", _score: 2, _createdAt: "2026-01-03T00:00:00Z" }),
    r({ _id: "d", _score: 3, _createdAt: "2026-01-04T00:00:00Z" }), // ties b
  ];
  it("sorts descending by single key", () => {
    const sorted = stableSort(data, "_score", "desc");
    expect(sorted.map((x) => x._id)).toEqual(["b", "d", "c", "a"]); // b before d (stable)
  });
  it("sorts ascending", () => {
    const sorted = stableSort(data, "_score", "asc");
    expect(sorted.map((x) => x._id)).toEqual(["a", "c", "b", "d"]);
  });
  it("multi-key tiebreak", () => {
    const sorted = stableSort(data, ["_score", "_createdAt"], "desc");
    expect(sorted.map((x) => x._id)).toEqual(["d", "b", "c", "a"]); // d.createdAt > b.createdAt
  });
  it("compares ISO timestamps as time", () => {
    const sorted = stableSort(data, "_createdAt", "desc");
    expect(sorted.map((x) => x._id)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("applyProject", () => {
  const rec = r({
    _kind: "memory",
    _id: "m1",
    _sessionId: "ses1",
    _project: "proj",
    _createdAt: "t",
    title: "hello",
    content: "body",
    extra: "drop me",
  });
  it("whitelists fields and always keeps envelope core", () => {
    const out = applyProject([rec], ["title"], undefined);
    expect(out[0]._kind).toBe("memory");
    expect(out[0]._id).toBe("m1");
    expect(out[0]._sessionId).toBe("ses1");
    expect(out[0]["title"]).toBe("hello");
    expect(out[0]["content"]).toBeUndefined();
    expect(out[0]["extra"]).toBeUndefined();
  });
  it("renames fields", () => {
    const out = applyProject([rec], undefined, { title: "headline" });
    expect(out[0]["headline"]).toBe("hello");
    expect(out[0]["title"]).toBe("hello"); // original kept
  });
  it("returns shallow copy (no mutation)", () => {
    const out = applyProject([rec], ["title"], undefined);
    expect(out[0]).not.toBe(rec);
  });
});

describe("applyDistinct", () => {
  it("dedups by _id (default)", () => {
    const out = applyDistinct(
      [
        r({ _id: "a" }),
        r({ _id: "b" }),
        r({ _id: "a", title: "second" }),
      ],
      "_id",
    );
    expect(out.length).toBe(2);
    expect(out.map((x) => x._id)).toEqual(["a", "b"]);
  });
  it("dedups by arbitrary field", () => {
    const out = applyDistinct(
      [
        r({ _id: "a", _project: "p1" }),
        r({ _id: "b", _project: "p1" }),
        r({ _id: "c", _project: "p2" }),
      ],
      "_project",
    );
    expect(out.length).toBe(2);
  });
});

describe("applyFlatten", () => {
  it("explodes array field into one row per item", () => {
    const out = applyFlatten([r({ _id: "x", tags: ["a", "b", "c"] })], "tags");
    expect(out.length).toBe(3);
    expect(out.map((x) => x["tags"])).toEqual(["a", "b", "c"]);
  });
  it("passes through non-array values unchanged", () => {
    const out = applyFlatten([r({ _id: "x", tags: "just-one" })], "tags");
    expect(out.length).toBe(1);
    expect(out[0]["tags"]).toBe("just-one");
  });
});

describe("applyGroupBy + applyTopNPerGroup", () => {
  const recs: EnvelopedRecord[] = [
    r({ _id: "a1", _project: "p1", _score: 5, _createdAt: "2026-01-01T00:00:00Z" }),
    r({ _id: "a2", _project: "p1", _score: 3, _createdAt: "2026-01-02T00:00:00Z" }),
    r({ _id: "a3", _project: "p1", _score: 7, _createdAt: "2026-01-03T00:00:00Z" }),
    r({ _id: "b1", _project: "p2", _score: 4, _createdAt: "2026-01-04T00:00:00Z" }),
    r({ _id: "b2", _project: "p2", _score: 6, _createdAt: "2026-01-05T00:00:00Z" }),
  ];
  it("groups produce group-typed records with members", () => {
    const grouped = applyGroupBy(recs, "_project");
    expect(grouped.length).toBe(2);
    expect(grouped.every((g) => g._kind === "group")).toBe(true);
    const p1 = grouped.find((g) => g["_groupKey"] === "p1")!;
    expect((p1["members"] as EnvelopedRecord[]).length).toBe(3);
  });
  it("top_n_per_group sorts by _score desc within group by default", () => {
    const grouped = applyGroupBy(recs, "_project");
    const top2 = applyTopNPerGroup(grouped, 2, "_score", "desc");
    // p1 top-2 by _score desc: a3 (7), a1 (5). p2: b2 (6), b1 (4).
    const ids = top2.map((x) => x._id);
    expect(ids).toContain("a3");
    expect(ids).toContain("a1");
    expect(ids).toContain("b2");
    expect(ids).toContain("b1");
    expect(ids).not.toContain("a2"); // beat out of top-2
    expect(top2.length).toBe(4);
  });
  it("top_n_per_group passes through non-group records unchanged", () => {
    const mixed: EnvelopedRecord[] = [r({ _id: "loose" })];
    const out = applyTopNPerGroup(mixed, 1, "_score", "desc");
    expect(out.length).toBe(1);
    expect(out[0]._id).toBe("loose");
  });
});

describe("applyJoin", () => {
  const left: EnvelopedRecord[] = [
    r({ _id: "l1", _sessionId: "s1" }),
    r({ _id: "l2", _sessionId: "s2" }),
    r({ _id: "l3", _sessionId: "s3" }),
  ];
  const right: EnvelopedRecord[] = [
    r({ _kind: "lesson", _id: "r-of-s1", _sessionId: "s1", content: "L1" }),
    r({ _kind: "lesson", _id: "r-of-s2a", _sessionId: "s2", content: "L2a" }),
    r({ _kind: "lesson", _id: "r-of-s2b", _sessionId: "s2", content: "L2b" }),
  ];
  it("left join attaches matches and emits null for misses", () => {
    const out = applyJoin(left, right, { left: "_sessionId", right: "_sessionId" }, "left");
    // l1 (1 match), l2 (2 matches), l3 (no match → null)
    expect(out.length).toBe(4);
    const noMatch = out.find((o) => o._id === "l3")!;
    expect((noMatch["_join"] as { right: unknown }).right).toBeNull();
    const l2Matches = out.filter((o) => o._id === "l2");
    expect(l2Matches.length).toBe(2);
  });
  it("inner join drops unmatched left records", () => {
    const out = applyJoin(left, right, { left: "_sessionId", right: "_sessionId" }, "inner");
    expect(out.length).toBe(3); // l1×1 + l2×2 + l3 dropped
    expect(out.find((o) => o._id === "l3")).toBeUndefined();
  });
});
