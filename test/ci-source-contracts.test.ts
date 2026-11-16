import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IIIClient } from "iii-sdk";
import { registerHealthMonitor } from "../src/health/monitor.js";
import { registerSlotsFunctions } from "../src/functions/slots.js";
import { withKeyedLock } from "../src/state/keyed-mutex.js";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function memoryKV() {
  const scopes = new Map<string, Map<string, unknown>>();
  return {
    get: async (scope: string, key: string) => scopes.get(scope)?.get(key) ?? null,
    set: async (scope: string, key: string, value: unknown) => {
      if (!scopes.has(scope)) scopes.set(scope, new Map());
      scopes.get(scope)!.set(key, value);
      return value;
    },
    list: async (scope: string) => [...(scopes.get(scope)?.values() ?? [])],
  };
}

async function healthFixture(initial: ReturnType<IIIClient["getConnectionState"]>) {
  let state = initial;
  let latest: unknown;
  const sdk = {
    getConnectionState: () => state,
    trigger: async () => ({ workers: [] }),
  };
  const kv = {
    get: async () => null,
    set: async (_scope: string, key: string, value: unknown) => {
      if (key === "latest") latest = value;
      return value;
    },
  };
  const monitor = registerHealthMonitor(sdk as never, kv as never);
  const snapshot = async () => {
    for (let i = 0; i < 50 && latest === undefined; i++) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    expect(latest).toBeDefined();
    return latest;
  };
  return {
    stop: monitor.stop,
    snapshot,
    change: (next: typeof state) => { state = next; latest = undefined; },
  };
}

describe("source contracts required by CI typechecking", () => {
  it.each(["connected", "connecting", "disconnected", "reconnecting", "failed"] as const)(
    "reports the SDK's actual %s connection state", async (state) => {
      const f = await healthFixture(state);
      try {
        expect(await f.snapshot()).toMatchObject({ connectionState: state });
      } finally {
        f.stop();
      }
    },
  );

  it("refreshes the SDK connection state on each health collection", async () => {
    const f = await healthFixture("connected");
    try {
      expect(await f.snapshot()).toMatchObject({ connectionState: "connected" });
      f.change("disconnected");
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await f.snapshot()).toMatchObject({ connectionState: "disconnected" });
    } finally {
      f.stop();
    }
  });

  it("replaces a slot with the string validated before waiting for its lock", async () => {
    const kv = memoryKV();
    const handlers = new Map<string, (data: Record<string, unknown>) => Promise<unknown>>();
    const sdk = {
      registerFunction: (id: string, fn: (data: Record<string, unknown>) => Promise<unknown>) => handlers.set(id, fn),
    };
    registerSlotsFunctions(sdk as never, kv as never);
    expect(await handlers.get("mem::slot-create")!({ label: "ci_contract", content: "old", sizeLimit: 8 }))
      .toMatchObject({ success: true });
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const hold = withKeyedLock("slot:ci_contract", async () => { entered(); await blocked; });
    await started;
    const request = { label: "ci_contract", content: "valid" };
    const replacing = handlers.get("mem::slot-replace")!(request);
    request.content = "changed after validation";
    release();
    await hold;
    expect(await replacing).toMatchObject({ success: true, slot: { content: "valid" }, size: 5 });
    expect(await handlers.get("mem::slot-get")!({ label: "ci_contract" }))
      .toMatchObject({ success: true, slot: { content: "valid" } });
  });
});
