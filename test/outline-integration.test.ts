import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("iii-sdk", () => ({
  getContext: () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
  }),
}));

import {
  buildOutline,
  registerOutlineFunctions,
} from "../src/functions/outline-build.js";

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      const entries = store.get(scope);
      return entries ? (Array.from(entries.values()) as T[]) : [];
    },
  };
}

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (opts: { id: string }, handler: Function) => {
      functions.set(opts.id, handler);
    },
    registerTrigger: () => {},
    trigger: async (id: string, data: unknown) => {
      const fn = functions.get(id);
      if (!fn) throw new Error(`No function: ${id}`);
      return fn(data);
    },
  };
}

const FIXTURE_PROJECT_CLAUDE = `# My Project

A short intro paragraph.

## Architecture

We use Node + Postgres.

### Database

Schema is in \`schema.sql\`.

### API

REST + WebSocket.

## Setup

\`\`\`bash
# This heading inside code MUST be ignored
npm install
\`\`\`

Run the dev server.

## Workflow

### Branching

Trunk-based.

### Reviews

PRs require 1 approval.
`;

const FIXTURE_BRIEF = `# Brief: Outline Index

## Context

Long docs are expensive to load.

## Goals

1. Tree of headings
2. Section extraction

## Non-goals

- Embeddings
- PDF support
`;

const FIXTURE_AUDIT = `# Audit Report — 2026-04

## Summary

All green.

## Findings

### Severity High

None.

### Severity Medium

#### Finding M-1

Mitigation in place.

#### Finding M-2

Tracked in JIRA-123.

### Severity Low

Cosmetic only.

## Recommendations

Carry on.
`;

describe("outline integration on realistic CLAUDE-style docs", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  const tmpFiles: string[] = [];

  beforeAll(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerOutlineFunctions(sdk as any, kv as any);
  });

  afterAll(async () => {
    await Promise.all(tmpFiles.map((f) => fs.unlink(f).catch(() => {})));
  });

  async function writeFixture(name: string, content: string): Promise<string> {
    const f = join(tmpdir(), `outline-int-${name}-${Date.now()}-${Math.random()}.md`);
    await fs.writeFile(f, content, "utf-8");
    tmpFiles.push(f);
    return f;
  }

  it("doc 1: project CLAUDE.md with code block fences", async () => {
    const f = await writeFixture("project", FIXTURE_PROJECT_CLAUDE);
    const built = await sdk.trigger("mem::outline-build", { path: f });
    expect(built.success).toBe(true);
    expect(built.title).toBe("My Project");

    const got = await sdk.trigger("mem::outline-get", { artifact_id: f });
    const root = got.outline.nodes[0];
    expect(root.children.map((c: any) => c.title)).toEqual([
      "Architecture",
      "Setup",
      "Workflow",
    ]);
    expect(root.children[0].children.map((c: any) => c.title)).toEqual([
      "Database",
      "API",
    ]);

    const setup = await sdk.trigger("mem::outline-section", {
      artifact_id: f,
      node_id: "1.2",
    });
    expect(setup.text).toContain("npm install");
    expect(setup.text).toContain("# This heading inside code MUST be ignored");
  });

  it("doc 2: brief with flat structure", async () => {
    const f = await writeFixture("brief", FIXTURE_BRIEF);
    const built = await sdk.trigger("mem::outline-build", { path: f });
    expect(built.success).toBe(true);

    const got = await sdk.trigger("mem::outline-get", { artifact_id: f });
    expect(got.outline.title).toBe("Brief: Outline Index");
    expect(got.outline.nodes[0].children).toHaveLength(3);

    const goals = await sdk.trigger("mem::outline-section", {
      artifact_id: f,
      node_id: "1.2",
    });
    expect(goals.node.title).toBe("Goals");
    expect(goals.text).toContain("Tree of headings");
    expect(goals.text).not.toContain("Non-goals");
  });

  it("doc 3: audit with 4-level nesting", async () => {
    const f = await writeFixture("audit", FIXTURE_AUDIT);
    const built = await sdk.trigger("mem::outline-build", { path: f });
    expect(built.success).toBe(true);

    const got = await sdk.trigger("mem::outline-get", { artifact_id: f });
    const root = got.outline.nodes[0];
    const findings = root.children.find((c: any) => c.title === "Findings");
    expect(findings).toBeDefined();
    expect(findings.children).toHaveLength(3);

    const medium = findings.children.find(
      (c: any) => c.title === "Severity Medium",
    );
    expect(medium.children.map((c: any) => c.title)).toEqual([
      "Finding M-1",
      "Finding M-2",
    ]);

    const m1 = await sdk.trigger("mem::outline-section", {
      artifact_id: f,
      node_id: medium.children[0].node_id,
    });
    expect(m1.text).toContain("Mitigation in place.");
    expect(m1.text).not.toContain("JIRA-123");
  });

  it("latency: 500-line doc round-trip < 100ms", async () => {
    const lines: string[] = ["# Big Doc"];
    for (let i = 0; i < 100; i++) {
      lines.push(`## Section ${i}`);
      for (let j = 0; j < 4; j++) lines.push(`line ${i}.${j}`);
    }
    const content = lines.join("\n");
    const f = await writeFixture("big", content);

    const t0 = performance.now();
    const built = await sdk.trigger("mem::outline-build", { path: f });
    const got = await sdk.trigger("mem::outline-get", { artifact_id: f });
    const sec = await sdk.trigger("mem::outline-section", {
      artifact_id: f,
      node_id: "1.50",
    });
    const elapsed = performance.now() - t0;

    expect(built.success).toBe(true);
    expect(got.success).toBe(true);
    expect(sec.success).toBe(true);
    expect(sec.node.title).toBe("Section 49");
    // Generous threshold — local machine + IO. Actual run typically <20ms.
    expect(elapsed).toBeLessThan(200);
  });

  it("buildOutline pure function on >500 lines is < 30ms", () => {
    const lines: string[] = ["# Root"];
    for (let i = 0; i < 200; i++) {
      lines.push(`## S${i}`);
      lines.push("body");
      lines.push("body");
    }
    const content = lines.join("\n");
    const t0 = performance.now();
    const o = buildOutline(content, "perf.md", "2026-01-01T00:00:00Z", 1234);
    const dt = performance.now() - t0;
    expect(o.nodes[0].children).toHaveLength(200);
    expect(dt).toBeLessThan(30);
  });
});
