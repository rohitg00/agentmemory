import { describe, expect, it, vi } from "vitest";
import { StateKV } from "../src/state/kv.js";

describe("StateKV", () => {
  it("routes get/set/update/delete/list through iii state functions", async () => {
    const trigger = vi
      .fn()
      .mockResolvedValueOnce({ value: 1 })
      .mockResolvedValueOnce({ saved: true })
      .mockResolvedValueOnce({ updated: true })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([{ id: "one" }]);
    const kv = new StateKV({ trigger } as any);

    await expect(kv.get("scope", "key")).resolves.toEqual({ value: 1 });
    await expect(kv.set("scope", "key", { value: 2 })).resolves.toEqual({ saved: true });
    await expect(kv.update("scope", "key", [{ type: "set", path: "/x", value: 3 }])).resolves.toEqual({ updated: true });
    await expect(kv.delete("scope", "key")).resolves.toBeUndefined();
    await expect(kv.list("scope")).resolves.toEqual([{ id: "one" }]);

    expect(trigger.mock.calls).toEqual([
      [{ function_id: "state::get", payload: { scope: "scope", key: "key" } }],
      [{ function_id: "state::set", payload: { scope: "scope", key: "key", value: { value: 2 } } }],
      [{ function_id: "state::update", payload: { scope: "scope", key: "key", ops: [{ type: "set", path: "/x", value: 3 }] } }],
      [{ function_id: "state::delete", payload: { scope: "scope", key: "key" } }],
      [{ function_id: "state::list", payload: { scope: "scope" } }],
    ]);
  });
});
