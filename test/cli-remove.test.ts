// Unit tests for the `agentmemory remove` destruction plan.
//
// The plan module is pure-fs (just inspects what's present) so we sandbox
// a fake $HOME under tmpdir() and assert which plan items come back. The
// actual file deletion is wrapped in src/cli.ts.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildRemovePlan,
  formatPlan,
  type ConnectManifest,
  type RemoveContext,
} from "../src/cli/remove-plan.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let sandbox: string;

function ctx(overrides: Partial<RemoveContext> = {}): RemoveContext {
  return {
    home: sandbox,
    pinnedVersion: "0.11.2",
    localBinIiiVersion: null,
    connectManifest: null,
    ...overrides,
  };
}

function touch(relPath: string, content = ""): void {
  const full = join(sandbox, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

function mkdir(relPath: string): void {
  mkdirSync(join(sandbox, relPath), { recursive: true });
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "agentmemory-remove-"));
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe("buildRemovePlan", () => {
  it("returns no applicable items on a clean system", () => {
    const plan = buildRemovePlan(ctx(), { force: false, keepData: false });
    const applicable = plan.filter((p) => p.applicable);
    expect(applicable.length).toBe(0);
  });

  it("includes pidfile + engine-state when both exist", () => {
    touch(".agentmemory/iii.pid", "12345\n");
    touch(".agentmemory/engine-state.json", "{}");
    const plan = buildRemovePlan(ctx(), { force: false, keepData: false });
    const ids = plan.filter((p) => p.applicable).map((p) => p.id);
    expect(ids).toContain("stop-engine");
    expect(ids).toContain("pidfile");
    expect(ids).toContain("engine-state");
  });

  it("marks .env as alwaysAsk", () => {
    touch(".agentmemory/.env", "ANTHROPIC_API_KEY=sk-ant-real\n");
    const plan = buildRemovePlan(ctx(), { force: false, keepData: false });
    const envItem = plan.find((p) => p.id === "env")!;
    expect(envItem.applicable).toBe(true);
    expect(envItem.alwaysAsk).toBe(true);
  });

  it("--keep-data hides .env, preferences, backups, and data-dir", () => {
    touch(".agentmemory/.env", "x");
    touch(".agentmemory/preferences.json", "{}");
    mkdir(".agentmemory/backups");
    mkdir(".agentmemory/data");
    const plan = buildRemovePlan(ctx(), { force: false, keepData: true });
    const applicable = plan.filter((p) => p.applicable).map((p) => p.id);
    expect(applicable).not.toContain("env");
    expect(applicable).not.toContain("preferences");
    expect(applicable).not.toContain("backups");
    expect(applicable).not.toContain("data-dir");
  });

  it("data-dir is alwaysAsk even on --force", () => {
    mkdir(".agentmemory/data");
    const plan = buildRemovePlan(ctx(), { force: true, keepData: false });
    const item = plan.find((p) => p.id === "data-dir")!;
    expect(item.applicable).toBe(true);
    expect(item.alwaysAsk).toBe(true);
  });

  it("expands connect-manifest entries into individual plan items", () => {
    const manifest: ConnectManifest = {
      installed: [
        { target: join(sandbox, "fake-claude-symlink"), agent: "claude-code", symlink: true },
        { target: join(sandbox, "fake-cursor-link"), agent: "cursor" },
      ],
    };
    touch("fake-claude-symlink");
    touch("fake-cursor-link");
    const plan = buildRemovePlan(ctx({ connectManifest: manifest }), {
      force: false,
      keepData: false,
    });
    const connectItems = plan.filter((p) => p.id.startsWith("connect:"));
    expect(connectItems.length).toBe(2);
    expect(connectItems.every((p) => p.applicable)).toBe(true);
  });

  it("local-bin/iii is alwaysAsk when version does not match", () => {
    touch(".local/bin/iii", "fakebin");
    const plan = buildRemovePlan(
      ctx({ localBinIiiVersion: "9.9.9" }),
      { force: false, keepData: false },
    );
    const item = plan.find((p) => p.id === "local-bin-iii")!;
    expect(item.applicable).toBe(true);
    expect(item.alwaysAsk).toBe(true);
  });

  it("local-bin/iii is auto-fixable when version matches pinned", () => {
    touch(".local/bin/iii", "fakebin");
    const plan = buildRemovePlan(
      ctx({ localBinIiiVersion: "0.11.2" }),
      { force: false, keepData: false },
    );
    const item = plan.find((p) => p.id === "local-bin-iii")!;
    expect(item.applicable).toBe(true);
    expect(item.alwaysAsk).toBe(false);
    expect(item.description).toContain("matches pinned");
  });

  it("local-bin/iii absent: no plan entry created", () => {
    const plan = buildRemovePlan(ctx(), { force: false, keepData: false });
    expect(plan.find((p) => p.id === "local-bin-iii")).toBeUndefined();
  });
});

describe("formatPlan", () => {
  it("renders applicable items with numbers", () => {
    touch(".agentmemory/iii.pid", "1");
    touch(".agentmemory/engine-state.json", "{}");
    const plan = buildRemovePlan(ctx(), { force: false, keepData: false });
    const out = formatPlan(plan);
    expect(out).toMatch(/^\s+1\./m);
    expect(out).toContain("pidfile");
    expect(out).toContain("engine-state.json");
  });

  it("marks alwaysAsk items with [asks]", () => {
    touch(".agentmemory/.env", "x");
    const plan = buildRemovePlan(ctx(), { force: false, keepData: false });
    const out = formatPlan(plan);
    expect(out).toContain("[asks]");
  });
});
