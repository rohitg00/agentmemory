import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockKV, mockSdk } from "./helpers/mocks.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function observePayload(hookType: string, data: unknown) {
  return {
    sessionId: "ses_dedup_test",
    project: "/home/user/myrepo",
    cwd: "/home/user/myrepo",
    hookType,
    timestamp: new Date().toISOString(),
    data,
  };
}

describe("observe dedup for hooks without tool_input", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("records consecutive prompt_submit observations with different prompts", async () => {
    const { registerObserveFunction } = await import("../src/functions/observe.js");
    const { DedupMap } = await import("../src/functions/dedup.js");
    const sdk = mockSdk({ looseTrigger: true });
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never, new DedupMap());

    const first = (await sdk.trigger(
      "mem::observe",
      observePayload("prompt_submit", { prompt: "ship the helm chart" }),
    )) as { observationId?: string; deduplicated?: boolean };
    const second = (await sdk.trigger(
      "mem::observe",
      observePayload("prompt_submit", { prompt: "now fix the failing test" }),
    )) as { observationId?: string; deduplicated?: boolean };

    expect(first.observationId).toBeTruthy();
    expect(second.deduplicated).toBeUndefined();
    expect(second.observationId).toBeTruthy();
  });

  it("records two prompt_submit observations whose data is distinct primitive strings", async () => {
    const { registerObserveFunction } = await import("../src/functions/observe.js");
    const { DedupMap } = await import("../src/functions/dedup.js");
    const sdk = mockSdk({ looseTrigger: true });
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never, new DedupMap());

    const first = (await sdk.trigger(
      "mem::observe",
      observePayload("prompt_submit", "ship the helm chart"),
    )) as { observationId?: string; deduplicated?: boolean };
    const second = (await sdk.trigger(
      "mem::observe",
      observePayload("prompt_submit", "now fix the failing test"),
    )) as { observationId?: string; deduplicated?: boolean };

    expect(first.observationId).toBeTruthy();
    expect(second.deduplicated).toBeUndefined();
    expect(second.observationId).toBeTruthy();
  });

  it("still dedups an identical prompt_submit within the TTL window", async () => {
    const { registerObserveFunction } = await import("../src/functions/observe.js");
    const { DedupMap } = await import("../src/functions/dedup.js");
    const sdk = mockSdk({ looseTrigger: true });
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never, new DedupMap());

    const payload = { prompt: "ship the helm chart" };
    const first = (await sdk.trigger(
      "mem::observe",
      observePayload("prompt_submit", payload),
    )) as { observationId?: string };
    const second = (await sdk.trigger(
      "mem::observe",
      observePayload("prompt_submit", payload),
    )) as { deduplicated?: boolean };

    expect(first.observationId).toBeTruthy();
    expect(second.deduplicated).toBe(true);
  });

  it("keeps a repeated tool call when its output changed", async () => {
    const { registerObserveFunction } = await import("../src/functions/observe.js");
    const { DedupMap } = await import("../src/functions/dedup.js");
    const sdk = mockSdk({ looseTrigger: true });
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never, new DedupMap());

    const first = (await sdk.trigger(
      "mem::observe",
      observePayload("post_tool_use", {
        tool_name: "Bash",
        tool_input: { command: "ls" },
        tool_response: "a.txt",
      }),
    )) as { observationId?: string };
    const second = (await sdk.trigger(
      "mem::observe",
      observePayload("post_tool_use", {
        tool_name: "Bash",
        tool_input: { command: "ls" },
        tool_response: "b.txt",
      }),
    )) as { deduplicated?: boolean };

    expect(first.observationId).toBeTruthy();
    expect(second.deduplicated).toBeUndefined();
    expect((second as { observationId?: string }).observationId).toBeTruthy();
  });

  it("still skips a repeated tool call with the same input and output, and counts it", async () => {
    const { registerObserveFunction } = await import("../src/functions/observe.js");
    const { DedupMap, getDedupSkippedCount } = await import("../src/functions/dedup.js");
    const sdk = mockSdk({ looseTrigger: true });
    const kv = mockKV();
    registerObserveFunction(sdk as never, kv as never, new DedupMap());
    const before = getDedupSkippedCount();

    for (const field of ["tool_response", "tool_output", "output"]) {
      const data = { tool_name: "Bash", tool_input: { command: `ls ${field}` }, [field]: "a.txt" };
      const first = (await sdk.trigger("mem::observe", observePayload("post_tool_use", data))) as { observationId?: string };
      const second = (await sdk.trigger("mem::observe", observePayload("post_tool_use", data))) as { deduplicated?: boolean };
      const changed = (await sdk.trigger(
        "mem::observe",
        observePayload("post_tool_use", { ...data, [field]: "b.txt" }),
      )) as { observationId?: string; deduplicated?: boolean };
      expect(first.observationId).toBeTruthy();
      expect(second.deduplicated).toBe(true);
      expect(changed.deduplicated).toBeUndefined();
      expect(changed.observationId).toBeTruthy();
    }
    expect(getDedupSkippedCount() - before).toBe(3);
  });
});
