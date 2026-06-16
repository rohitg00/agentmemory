import { describe, expect, it } from "vitest";

import { buildJsonRequestHeaders } from "../src/cli/http.js";

describe("CLI JSON request auth headers", () => {
  it("adds bearer auth when AGENTMEMORY_SECRET is set for loopback HTTP", () => {
    expect(
      buildJsonRequestHeaders("http://localhost:3111/agentmemory/session/start", {
        AGENTMEMORY_SECRET: "secret",
      }),
    ).toEqual({
      ok: true,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret",
      },
    });
  });

  it("does not add Authorization when AGENTMEMORY_SECRET is unset", () => {
    expect(
      buildJsonRequestHeaders("http://memory.example:3111/agentmemory/session/start", {}),
    ).toEqual({
      ok: true,
      headers: {
        "Content-Type": "application/json",
      },
    });
  });

  it("allows bearer auth over HTTPS for non-loopback hosts", () => {
    expect(
      buildJsonRequestHeaders("https://memory.example/agentmemory/session/start", {
        AGENTMEMORY_SECRET: "secret",
      }),
    ).toEqual({
      ok: true,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer secret",
      },
    });
  });

  it("blocks bearer auth over plaintext HTTP for non-loopback hosts", () => {
    const result = buildJsonRequestHeaders(
      "http://memory.example:3111/agentmemory/session/start",
      { AGENTMEMORY_SECRET: "secret" },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("plaintext HTTP");
      expect(result.message).toContain("http://memory.example:3111/agentmemory/session/start");
    }
  });
});
