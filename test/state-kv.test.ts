import { describe, expect, it, vi } from "vitest";
import { StateKV } from "../src/state/kv.js";

describe("StateKV", () => {
  it("rejects missing and blank get keys before serializing state::get", async () => {
    const trigger = vi.fn();
    const kv = new StateKV({ trigger } as never);

    await expect(kv.get("mem:sessions", undefined as never)).rejects.toThrow(
      "key must be a non-empty string",
    );
    await expect(kv.get("mem:sessions", "")).rejects.toThrow(
      "key must be a non-empty string",
    );
    await expect(kv.get("mem:sessions", " ")).rejects.toThrow(
      "key must be a non-empty string",
    );
    expect(trigger).not.toHaveBeenCalled();
  });
});
