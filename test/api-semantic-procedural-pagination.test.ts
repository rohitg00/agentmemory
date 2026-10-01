import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerApiTriggers } from "../src/triggers/api.js";
import { KV } from "../src/state/schema.js";
import { SAFE_PAYLOAD_BYTES } from "../src/state/frame-guard.js";

// GET /semantic and /procedural returned the whole scope in one response.
// A 23 MB semantic scope crossed the engine's 16 MiB frame limit, dropping
// the worker (every route 404s) on each 30 s viewer dashboard poll. Both
// now return one page plus the total, and refuse an oversized page as 413.

/** In-memory StateKV: one Map per scope; get and update are no-ops. */
function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async () => null,
    set: async <T>(s: string, k: string, d: T) => {
      if (!store.has(s)) store.set(s, new Map());
      store.get(s)!.set(k, d);
      return d;
    },
    delete: async (s: string, k: string) => {
      store.get(s)?.delete(k);
    },
    update: async () => {},
    list: async <T>(scope: string): Promise<T[]> =>
      Array.from(store.get(scope)?.values() ?? []) as T[],
  };
}

/** SDK stub that records registered functions so a handler can be called directly. */
function mockSdk() {
  const fns = new Map<string, Function>();
  return {
    registerFunction: (id: string, h: Function) => fns.set(id, h),
    registerTrigger: () => {},
    trigger: async (input: { function_id: string; payload?: unknown }) =>
      fns.get(input.function_id)?.(input.payload),
    _fns: fns,
  };
}

type Res = { status_code: number; body: Record<string, unknown> };

/** Record `i` was created `i` minutes after a fixed epoch, so a higher `i` is newer. */
const createdAt = (i: number) =>
  new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString();

/** Ids from newest to oldest for `n` seeded records. */
const newestFirst = (n: number) =>
  Array.from({ length: n }, (_, i) => `id_${n - 1 - i}`);

/** Seeds `n` records of `bytesEach` bytes into `scope` and registers the API handlers. */
async function setupWithKV(scope: string, n: number, bytesEach = 20) {
  const kv = mockKV();
  for (let i = 0; i < n; i++) {
    await kv.set(scope, `id_${i}`, {
      id: `id_${i}`,
      createdAt: createdAt(i),
      fact: "f".repeat(bytesEach),
    });
  }
  const sdk = mockSdk();
  registerApiTriggers(sdk as never, kv as never);
  return { sdk, kv };
}

/** Same as setupWithKV, for tests that do not touch the store afterwards. */
async function setup(scope: string, n: number, bytesEach = 20) {
  return (await setupWithKV(scope, n, bytesEach)).sdk;
}

/** Invokes a registered handler with the given query parameters. */
const call = (
  sdk: ReturnType<typeof mockSdk>,
  fn: string,
  q: Record<string, string> = {},
) => sdk._fns.get(fn)!({ headers: {}, query_params: q }) as Promise<Res>;

const CASES = [
  { fn: "api::semantic-list", scope: KV.semantic, key: "semantic" },
  { fn: "api::procedural-list", scope: KV.procedural, key: "procedural" },
] as const;

for (const c of CASES) {
  describe(`${c.fn} pagination`, () => {
    it("returns a default page of 50 plus the total and a cursor", async () => {
      const sdk = await setup(c.scope, 120);
      const r = await call(sdk, c.fn);
      expect(r.status_code).toBe(200);
      expect((r.body[c.key] as unknown[]).length).toBe(50);
      expect(r.body.total).toBe(120);
      expect(typeof r.body.nextCursor).toBe("string");
    });

    it("walks every record by following nextCursor", async () => {
      const sdk = await setup(c.scope, 12);
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 10; i++) {
        const q: Record<string, string> = { limit: "5" };
        if (cursor) q.cursor = cursor;
        const r = await call(sdk, c.fn, q);
        seen.push(...(r.body[c.key] as Array<{ id: string }>).map((x) => x.id));
        cursor = r.body.nextCursor as string | null;
        if (!cursor) break;
      }
      expect(seen).toEqual(newestFirst(12));
    });

    it("skips no record when a row before the cursor is deleted mid-walk", async () => {
      const { sdk, kv } = await setupWithKV(c.scope, 12);
      const first = await call(sdk, c.fn, { limit: "5" });
      const firstIds = (first.body[c.key] as Array<{ id: string }>).map(
        (x) => x.id,
      );
      await kv.delete(c.scope, firstIds[0]);
      const seen = [...firstIds];
      let cursor = first.body.nextCursor as string | null;
      while (cursor) {
        const r = await call(sdk, c.fn, { limit: "5", cursor });
        seen.push(...(r.body[c.key] as Array<{ id: string }>).map((x) => x.id));
        cursor = r.body.nextCursor as string | null;
      }
      expect(seen).toEqual(newestFirst(12));
    });

    it("orders by id when two records share a createdAt", async () => {
      const { sdk, kv } = await setupWithKV(c.scope, 0);
      for (const id of ["b", "a", "c"]) {
        await kv.set(c.scope, id, { id, createdAt: createdAt(0), fact: "f" });
      }
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const q: Record<string, string> = { limit: "1" };
        if (cursor) q.cursor = cursor;
        const r = await call(sdk, c.fn, q);
        seen.push(...(r.body[c.key] as Array<{ id: string }>).map((x) => x.id));
        cursor = r.body.nextCursor as string | null;
      } while (cursor);
      expect(seen).toEqual(["c", "b", "a"]);
    });

    it("caps limit at 500", async () => {
      const sdk = await setup(c.scope, 600);
      const r = await call(sdk, c.fn, { limit: "100000" });
      expect((r.body[c.key] as unknown[]).length).toBe(500);
    });

    it("falls back to the default page for a limit that is not a number", async () => {
      // parseInt would read "5abc" as 5; the shared list-query parser rejects it.
      const sdk = await setup(c.scope, 60);
      for (const limit of ["5abc", "abc", "0", "-3", ""]) {
        const r = await call(sdk, c.fn, { limit });
        expect(
          (r.body[c.key] as unknown[]).length,
          `limit=${JSON.stringify(limit)}`,
        ).toBe(50);
      }
    });

    it("the last page has no nextCursor", async () => {
      const sdk = await setup(c.scope, 3);
      const r = await call(sdk, c.fn, { limit: "5" });
      expect((r.body[c.key] as unknown[]).length).toBe(3);
      expect(r.body.nextCursor).toBeNull();
    });

    it("refuses a page over the frame limit with 413 instead of sending it", async () => {
      const each = Math.ceil(SAFE_PAYLOAD_BYTES / 40) + 1024;
      const sdk = await setup(c.scope, 50, each);
      const r = await call(sdk, c.fn);
      expect(r.status_code).toBe(413);
      expect(r.body).toMatchObject({ oversized: true });
      expect(JSON.stringify(r.body).length).toBeLessThan(10_000);
      // The page must exceed the 16 MiB frame, so this test is slow on a loaded runner.
    }, 30_000);
  });
}

describe("viewer asks for a page, not the whole scope", () => {
  const html = readFileSync("src/viewer/index.html", "utf-8");
  it("requests semantic and procedural with a limit", () => {
    expect(html).toMatch(/semantic: \{ path: 'semantic\?limit=\d+'/);
    expect(html).toMatch(/procedural: \{ path: 'procedural\?limit=\d+'/);
    expect(html).not.toMatch(/path: 'semantic'/);
    expect(html).not.toMatch(/path: 'procedural'/);
  });
});

describe("viewer loads every page of semantic and procedural", () => {
  const html = readFileSync("src/viewer/index.html", "utf-8");

  /** Returns the source of one viewer function, by brace matching. */
  function extractFunction(name: string): string {
    const start = html.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`function ${name} not found in viewer`);
    let depth = 0;
    for (let i = html.indexOf("{", start); i < html.length; i++) {
      if (html[i] === "{") depth++;
      if (html[i] === "}") {
        depth--;
        if (depth === 0) return html.slice(start, i + 1);
      }
    }
    throw new Error(`function ${name} is not balanced`);
  }

  type Spec = { path: string; key: string; fallbackKey?: string };
  type Page = Record<string, unknown> | null;

  /** Builds the viewer's fetchAllPages over a stubbed apiGet. */
  function load(pages: Record<string, Page>) {
    const calls: string[] = [];
    /** Records the path and returns its canned page, or null like a failed request. */
    const apiGet = async (path: string) => {
      calls.push(path);
      return path in pages ? pages[path] : null;
    };
    const fetchAllPages = new Function(
      "apiGet",
      `${extractFunction("listOr")}\nasync ${extractFunction(
        "fetchAllPages",
      )}\nreturn fetchAllPages;`,
    )(apiGet) as (spec: Spec) => Promise<unknown[] | null>;
    return { calls, fetchAllPages };
  }

  const spec: Spec = {
    path: "semantic?limit=2",
    key: "facts",
    fallbackKey: "semantic",
  };

  it("follows nextCursor until the last page", async () => {
    const { calls, fetchAllPages } = load({
      "semantic?limit=2": {
        semantic: [{ id: "a" }, { id: "b" }],
        nextCursor: "c1",
      },
      "semantic?limit=2&cursor=c1": {
        semantic: [{ id: "c" }, { id: "d" }],
        nextCursor: "c2",
      },
      "semantic?limit=2&cursor=c2": { semantic: [{ id: "e" }] },
    });
    expect(await fetchAllPages(spec)).toEqual([
      { id: "a" },
      { id: "b" },
      { id: "c" },
      { id: "d" },
      { id: "e" },
    ]);
    expect(calls).toHaveLength(3);
  });

  it("makes one request when the first page is the last", async () => {
    const { calls, fetchAllPages } = load({
      "semantic?limit=2": { semantic: [{ id: "a" }] },
    });
    expect(await fetchAllPages(spec)).toEqual([{ id: "a" }]);
    expect(calls).toEqual(["semantic?limit=2"]);
  });

  it("encodes the cursor into the query string", async () => {
    const { calls, fetchAllPages } = load({
      "semantic?limit=2": { semantic: [], nextCursor: "a+b/c=" },
      "semantic?limit=2&cursor=a%2Bb%2Fc%3D": { semantic: [{ id: "x" }] },
    });
    expect(await fetchAllPages(spec)).toEqual([{ id: "x" }]);
    expect(calls[1]).toBe("semantic?limit=2&cursor=a%2Bb%2Fc%3D");
  });

  it("returns null when the first page fails", async () => {
    const { fetchAllPages } = load({});
    expect(await fetchAllPages(spec)).toBeNull();
  });

  it("returns null, not a partial list, when a later page fails", async () => {
    const { fetchAllPages } = load({
      "semantic?limit=2": { semantic: [{ id: "a" }], nextCursor: "c1" },
    });
    expect(await fetchAllPages(spec)).toBeNull();
  });

  it("fails the load, after two requests, when the server repeats a cursor", async () => {
    const { calls, fetchAllPages } = load({
      "semantic?limit=2": { semantic: [{ id: "a" }], nextCursor: "c1" },
      "semantic?limit=2&cursor=c1": {
        semantic: [{ id: "b" }],
        nextCursor: "c1",
      },
    });
    expect(await fetchAllPages(spec)).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it("is used for semantic and procedural only", () => {
    expect(html).toMatch(
      /semantic: \{ path: 'semantic\?limit=\d+', key: 'facts', fallbackKey: 'semantic', allPages: true \}/,
    );
    expect(html).toMatch(
      /procedural: \{ path: 'procedural\?limit=\d+', key: 'procedures', fallbackKey: 'procedural', allPages: true \}/,
    );
    expect(html.match(/allPages: true/g)).toHaveLength(2);
    expect(extractFunction("ensureLoaded")).toMatch(
      /spec\.allPages[\s\S]*fetchAllPages\(spec\)/,
    );
  });
});

describe("viewer retries an all-pages load that loses its replay range", () => {
  const html = readFileSync("src/viewer/index.html", "utf-8");

  /** Returns the source of one viewer function, by brace matching. */
  function extractFunction(name: string): string {
    const start = html.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`function ${name} not found in viewer`);
    let depth = 0;
    for (let i = html.indexOf("{", start); i < html.length; i++) {
      if (html[i] === "{") depth++;
      if (html[i] === "}") {
        depth--;
        if (depth === 0) return html.slice(start, i + 1);
      }
    }
    throw new Error(`function ${name} is not balanced`);
  }

  type Harness = {
    ensureLoaded: (kind: string) => Promise<void>;
    store: { loaded: Record<string, boolean> };
    replaced: unknown[][];
    attempts: () => number;
  };

  /**
   * Runs the viewer's ensureLoaded with stubbed globals. `evictOn(attempt)`
   * says whether that load attempt sees more live events than the log holds.
   */
  function harness(evictOn: (attempt: number) => boolean): Harness {
    const build = new Function(
      "evictOn",
      `
      var EVENT_LOG_MAX = 500;
      ${html.match(/var ALL_PAGES_ATTEMPTS = \d+;/)![0]}
      var eventLog = [];
      var eventSeq = 0;
      var store = { loaded: {}, loading: {}, entities: {} };
      var bootGate = Promise.resolve();
      var ENTITY_ENDPOINTS = {
        semantic: { path: 'semantic?limit=2', key: 'facts', fallbackKey: 'semantic', allPages: true }
      };
      var replaced = [];
      var attempts = 0;
      function replaceBucket(kind, rows) { replaced.push(rows); }
      function replayEventsSince() {}
      function liveEvent() {
        eventLog.push({ seq: ++eventSeq });
        if (eventLog.length > EVENT_LOG_MAX) eventLog.shift();
      }
      liveEvent();
      async function apiGet(path) {
        attempts++;
        var n = evictOn(attempts) ? EVENT_LOG_MAX + 1 : 1;
        for (var i = 0; i < n; i++) liveEvent();
        return { semantic: [{ id: 'a' }] };
      }
      ${extractFunction("listOr")}
      ${extractFunction("replayRangeIntact")}
      async ${extractFunction("fetchAllPages")}
      async ${extractFunction("ensureLoaded")}
      return { ensureLoaded: ensureLoaded, store: store, replaced: replaced,
               attempts: function() { return attempts; } };
      `,
    );
    return build(evictOn) as Harness;
  }

  it("loads on the first attempt when no event is evicted", async () => {
    const h = harness(() => false);
    await h.ensureLoaded("semantic");
    expect(h.store.loaded.semantic).toBe(true);
    expect(h.replaced).toHaveLength(1);
    expect(h.attempts()).toBe(1);
  });

  it("retries when the first attempt loses its replay range", async () => {
    const h = harness((attempt) => attempt === 1);
    await h.ensureLoaded("semantic");
    expect(h.store.loaded.semantic).toBe(true);
    expect(h.replaced).toHaveLength(1);
    expect(h.attempts()).toBe(2);
  });

  it("stays unloaded, without committing, after a bounded number of lost ranges", async () => {
    const h = harness(() => true);
    await h.ensureLoaded("semantic");
    expect(h.store.loaded.semantic).toBeFalsy();
    expect(h.replaced).toHaveLength(0);
    expect(h.attempts()).toBe(3);
  });
});
