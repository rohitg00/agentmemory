import { describe, expect, it, vi } from "vitest";
import {
  createPlaintextBearerAuthGuard,
  plaintextBearerAuthMessage,
  usesPlaintextBearerAuth,
} from "../src/security/plaintext-bearer-auth.js";

describe("shared plaintext bearer auth guard", () => {
  it("allows loopback HTTP, HTTPS, no-secret HTTP, and malformed local config without warning", () => {
    expect(usesPlaintextBearerAuth("http://localhost:3111", "secret")).toBe(false);
    expect(usesPlaintextBearerAuth("http://127.0.0.1:3111", "secret")).toBe(false);
    expect(usesPlaintextBearerAuth("http://[::1]:3111", "secret")).toBe(false);
    expect(usesPlaintextBearerAuth("https://memory.example", "secret")).toBe(false);
    expect(usesPlaintextBearerAuth("http://memory.example", "")).toBe(false);
    expect(usesPlaintextBearerAuth("not a url", "secret")).toBe(false);
  });

  it("blocks remote plaintext HTTP when a bearer secret would be sent", () => {
    expect(usesPlaintextBearerAuth("http://memory.example:3111", "secret")).toBe(true);
    expect(usesPlaintextBearerAuth("http://192.168.1.10:3111", "secret")).toBe(true);
    expect(usesPlaintextBearerAuth("http://localhost.evil.example:3111", "secret")).toBe(true);
  });

  it("warns once and returns false without including the bearer value in the message", () => {
    const warn = vi.fn();
    const guard = createPlaintextBearerAuthGuard(warn, {});

    expect(guard("http://memory.example:3111", "super-secret-token")).toBe(false);
    expect(guard("http://memory.example:3111", "super-secret-token")).toBe(false);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("plaintext HTTP to http://memory.example:3111");
    expect(warn.mock.calls[0][0]).not.toContain("super-secret-token");
  });

  it("throws before warning when HTTPS is required", () => {
    const warn = vi.fn();
    const guard = createPlaintextBearerAuthGuard(warn, {
      AGENTMEMORY_REQUIRE_HTTPS: "1",
    });

    expect(() => guard("http://memory.example:3111", "secret")).toThrow(
      /plaintext HTTP to http:\/\/memory\.example:3111/,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("builds a safe diagnostic message without echoing secret material", () => {
    const message = plaintextBearerAuthMessage("http://memory.example:3111");
    expect(message).toContain("AGENTMEMORY_SECRET");
    expect(message).toContain("Bearer tokens and memory payloads can be observed");
    expect(message).toContain("use HTTPS or an SSH tunnel");
    expect(message).not.toContain("super-secret-token");
    expect(message).not.toContain("Authorization: Bearer");
  });
});
