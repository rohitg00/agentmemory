import { beforeEach, describe, expect, it } from "vitest";
import { registerMemoryPolicyFunction } from "../src/functions/memory-policy.js";
import { KV } from "../src/state/schema.js";
import type { MemoryPolicy } from "../src/types.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

describe("Memory Policy", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(() => {
    sdk = mockSdk();
    kv = mockKV();
    registerMemoryPolicyFunction(sdk as never, kv as never);
  });

  it("returns a conservative default policy when no policy is saved", async () => {
    const result = (await sdk.trigger("mem::policy-get", {})) as {
      success: boolean;
      policy: MemoryPolicy;
    };

    expect(result.success).toBe(true);
    expect(result.policy.id).toBe("default");
    expect(result.policy.writePolicy.mode).toBe("shadow");
    expect(result.policy.writePolicy.neverAutoWriteShared).toBe(true);
    expect(result.policy.queryExpansions).toEqual([]);
    expect(result.policy.preflightRules).toEqual([]);
  });

  it("updates policy with validated query expansion rules", async () => {
    const result = (await sdk.trigger("mem::policy-update", {
      queryExpansions: [
        {
          id: "cfg",
          trigger: "配置",
          expansions: ["config.yaml", "provider", ""],
          scope: "project",
          project: "agentmemory",
          enabled: true,
        },
      ],
      writePolicy: {
        mode: "shadow",
        autoWriteThreshold: 0.9,
        allowedAutoTypes: ["preference", "workflow", "bad-type"],
        neverAutoWriteShared: true,
      },
      preflightRules: [],
    })) as { success: boolean; policy: MemoryPolicy };

    expect(result.success).toBe(true);
    expect(result.policy.queryExpansions[0]).toMatchObject({
      id: "cfg",
      trigger: "配置",
      expansions: ["config.yaml", "provider"],
      scope: "project",
      project: "agentmemory",
      enabled: true,
    });
    expect(result.policy.writePolicy.allowedAutoTypes).toEqual([
      "preference",
      "workflow",
    ]);
    expect(await kv.get(KV.memoryPolicy, "default")).toEqual(result.policy);
  });

  it("expands queries using enabled global and matching project rules", async () => {
    await sdk.trigger("mem::policy-update", {
      queryExpansions: [
        {
          id: "global-config",
          trigger: "配置",
          expansions: ["config.yaml", "provider"],
          scope: "global",
          enabled: true,
        },
        {
          id: "project-gateway",
          trigger: "配置",
          expansions: ["gateway", "service"],
          scope: "project",
          project: "agentmemory",
          enabled: true,
        },
      ],
    });

    const result = (await sdk.trigger("mem::policy-expand-query", {
      query: "改配置",
      project: "agentmemory",
      maxQueries: 6,
    })) as { success: boolean; expansion: { original: string; reformulations: string[] } };

    expect(result.success).toBe(true);
    expect(result.expansion.original).toBe("改配置");
    expect(result.expansion.reformulations).toEqual([
      "config.yaml",
      "provider",
      "gateway",
      "service",
    ]);
  });

  it("ignores disabled and non-matching project rules while deduplicating expansions", async () => {
    await sdk.trigger("mem::policy-update", {
      queryExpansions: [
        {
          id: "disabled",
          trigger: "配置",
          expansions: ["disabled-term"],
          enabled: false,
        },
        {
          id: "other-project",
          trigger: "配置",
          expansions: ["other-project-term"],
          scope: "project",
          project: "other",
          enabled: true,
        },
        {
          id: "global",
          trigger: "配置",
          expansions: ["config.yaml", "config.yaml", "provider"],
          enabled: true,
        },
      ],
    });

    const result = (await sdk.trigger("mem::policy-expand-query", {
      query: "配置 provider",
      project: "agentmemory",
      maxQueries: 3,
    })) as { success: boolean; expansion: { reformulations: string[] } };

    expect(result.success).toBe(true);
    expect(result.expansion.reformulations).toEqual(["config.yaml", "provider"]);
  });
});
