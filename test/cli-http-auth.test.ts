import { describe, expect, it } from "vitest";
import {
  agentmemoryAuthHeaders,
  agentmemoryJsonHeaders,
} from "../src/cli/http-auth.js";

describe("CLI HTTP auth headers", () => {
  it("omits Authorization when AGENTMEMORY_SECRET is unset", () => {
    expect(agentmemoryAuthHeaders({})).toEqual({});
    expect(agentmemoryJsonHeaders({})).toEqual({
      "Content-Type": "application/json",
    });
  });

  it("adds Bearer auth when AGENTMEMORY_SECRET is configured", () => {
    const env = { AGENTMEMORY_SECRET: "secret-token" };

    expect(agentmemoryAuthHeaders(env)).toEqual({
      Authorization: "Bearer secret-token",
    });
    expect(agentmemoryJsonHeaders(env)).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer secret-token",
    });
  });
});
