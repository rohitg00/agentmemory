import { describe, it, expect, vi } from "vitest";
import type { MemoryProvider } from "../src/types.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function mockSdk() {
  const functions = new Map<string, Function>();
  return {
    registerFunction: (idOrOpts: string | { id: string }, fn: Function) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      functions.set(id, fn);
    },
    trigger: async (idOrInput: string | { function_id: string; payload: unknown }, data?: unknown) => {
      const id = typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload = typeof idOrInput === "string" ? data : idOrInput.payload;
      const fn = functions.get(id);
      if (fn) return fn(payload);
      return null;
    },
  };
}

describe("QueryExpansion", () => {
  it("imports without errors", async () => {
    const mod = await import("../src/functions/query-expansion.js");
    expect(mod.registerQueryExpansionFunction).toBeDefined();
    expect(mod.extractEntitiesFromQuery).toBeDefined();
  });

  it("extracts entities from capitalized words", async () => {
    const { extractEntitiesFromQuery } = await import(
      "../src/functions/query-expansion.js"
    );
    const entities = extractEntitiesFromQuery(
      'What happened with React and the Vue migration?',
    );
    expect(entities).toContain("React");
    expect(entities).toContain("Vue");
    expect(entities).not.toContain("What");
  });

  it("extracts quoted entities", async () => {
    const { extractEntitiesFromQuery } = await import(
      "../src/functions/query-expansion.js"
    );
    const entities = extractEntitiesFromQuery(
      'Find memories about "auth middleware" changes',
    );
    expect(entities).toContain("auth middleware");
  });

  it("expands queries via LLM", async () => {
    const { registerQueryExpansionFunction } = await import(
      "../src/functions/query-expansion.js"
    );

    const response = `<expansion>
  <reformulations>
    <query>Authentication middleware modifications</query>
    <query>JWT token validation changes</query>
    <query>Security layer updates</query>
  </reformulations>
  <temporal>
    <query>Auth changes in the past 7 days</query>
  </temporal>
  <entities>
    <entity>auth middleware</entity>
    <entity>JWT</entity>
  </entities>
</expansion>`;

    const provider: MemoryProvider = {
      name: "test",
      compress: vi.fn().mockResolvedValue(response),
      summarize: vi.fn().mockResolvedValue(response),
    };

    const sdk = mockSdk();
    registerQueryExpansionFunction(sdk as never, provider);

    const result = (await sdk.trigger("mem::expand-query", {
      query: "What changed in auth?",
    })) as { success: boolean; expansion: any };

    expect(result.success).toBe(true);
    expect(result.expansion.original).toBe("What changed in auth?");
    expect(result.expansion.reformulations.length).toBe(3);
    expect(result.expansion.entityExtractions).toContain("auth middleware");
    expect(result.expansion.temporalConcretizations.length).toBe(1);
  });

  it("returns empty expansion on LLM failure", async () => {
    const { registerQueryExpansionFunction } = await import(
      "../src/functions/query-expansion.js"
    );

    const provider: MemoryProvider = {
      name: "test",
      compress: vi.fn().mockRejectedValue(new Error("LLM down")),
      summarize: vi.fn().mockRejectedValue(new Error("LLM down")),
    };

    const sdk = mockSdk();
    registerQueryExpansionFunction(sdk as never, provider);

    const result = (await sdk.trigger("mem::expand-query", {
      query: "test query",
    })) as { success: boolean; expansion: any };

    expect(result.success).toBe(true);
    expect(result.expansion.original).toBe("test query");
    expect(result.expansion.reformulations).toEqual([]);
  });

  it("respects maxReformulations limit", async () => {
    const { registerQueryExpansionFunction } = await import(
      "../src/functions/query-expansion.js"
    );

    const response = `<expansion>
  <reformulations>
    <query>Query A</query>
    <query>Query B</query>
    <query>Query C</query>
    <query>Query D</query>
    <query>Query E</query>
    <query>Query F</query>
  </reformulations>
  <temporal></temporal>
  <entities></entities>
</expansion>`;

    const provider: MemoryProvider = {
      name: "test",
      compress: vi.fn().mockResolvedValue(response),
      summarize: vi.fn().mockResolvedValue(response),
    };

    const sdk = mockSdk();
    registerQueryExpansionFunction(sdk as never, provider);

    const result = (await sdk.trigger("mem::expand-query", {
      query: "test",
      maxReformulations: 3,
    })) as { success: boolean; expansion: any };

    expect(result.expansion.reformulations.length).toBe(3);
  });
});
