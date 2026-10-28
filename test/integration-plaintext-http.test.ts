import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import openclawPlugin from "../integrations/openclaw/plugin.mjs";
import { guardPlaintextBearerAuth } from "../integrations/pi/security.ts";

type OpenClawHandler = (event: Record<string, unknown>) => Promise<unknown>;

function mockFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
  (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function registerOpenClaw(baseUrl: string) {
  const handlers = new Map<string, OpenClawHandler>();
  const warn = vi.fn();
  openclawPlugin.register({
    pluginConfig: { base_url: baseUrl },
    logger: { warn },
    on(event: string, handler: OpenClawHandler) {
      handlers.set(event, handler);
    },
  });
  return { handlers, warn };
}

describe("OpenClaw plaintext bearer guard", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv, AGENTMEMORY_SECRET: "secret" };
    delete process.env["AGENTMEMORY_REQUIRE_HTTPS"];
    mockFetch();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("keeps loopback HTTP silent", async () => {
    const { handlers, warn } = registerOpenClaw("http://localhost:3111");
    await handlers.get("before_prompt_build")?.({ prompt: "recall auth work", sessionId: "s", cwd: "/project" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns once for non-loopback HTTP with a bearer secret", async () => {
    const { handlers, warn } = registerOpenClaw("http://remote.example:3111");
    await handlers.get("before_prompt_build")?.({ prompt: "first", sessionId: "s", cwd: "/project" });
    await handlers.get("before_prompt_build")?.({ prompt: "second", sessionId: "s", cwd: "/project" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("plaintext HTTP to http://remote.example:3111");
  });

  it("keeps HTTPS with a bearer secret silent", async () => {
    const { handlers, warn } = registerOpenClaw("https://remote.example");
    await handlers.get("before_prompt_build")?.({ prompt: "recall auth work", sessionId: "s", cwd: "/project" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("fails before any request when HTTPS is required", () => {
    process.env["AGENTMEMORY_REQUIRE_HTTPS"] = "1";
    const fetchMock = mockFetch();
    expect(() => registerOpenClaw("http://remote.example:3111")).toThrow(
      /plaintext HTTP to http:\/\/remote\.example:3111/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("pi plaintext bearer guard", () => {
  it.each(["http://127.0.0.1:3111", "http://127.0.0.2:3111", "http://[::1]:3111", "http://localhost:3111", "https://remote.example"])("allows %s", url => {
    expect(() => guardPlaintextBearerAuth(url, "secret")).not.toThrow();
  });
  it.each(["http://remote.example", "http://localhost.evil.com", "http://192.168.1.50", "http://10.0.0.42"])("refuses plaintext credentials to %s", url => {
    expect(() => guardPlaintextBearerAuth(url, "secret")).toThrow("Use HTTPS or an SSH tunnel");
    expect(() => guardPlaintextBearerAuth(url)).not.toThrow();
  });
});

describe("Hermes plaintext bearer guard", () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "agentmemory-hermes-test-"));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it("covers loopback, remote HTTP, HTTPS, and require-HTTPS behavior", () => {
    const script = String.raw`
import importlib.util
import os
import sys

spec = importlib.util.spec_from_file_location("agentmemory_hermes", "integrations/hermes/__init__.py")
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)

for key in ("AGENTMEMORY_SECRET", "AGENTMEMORY_URL", "AGENTMEMORY_REQUIRE_HTTPS"):
    os.environ.pop(key, None)

warnings = []
mod._reset_plaintext_bearer_guard_for_tests()
mod._check_plaintext_bearer_guard("http://localhost:3111", "secret", warnings.append)
assert warnings == [], warnings

mod._reset_plaintext_bearer_guard_for_tests()
mod._check_plaintext_bearer_guard("http://remote.example:3111", "secret", warnings.append)
mod._check_plaintext_bearer_guard("http://remote.example:3111", "secret", warnings.append)
assert len(warnings) == 1, warnings
assert "plaintext HTTP to http://remote.example:3111" in warnings[0], warnings

warnings = []
mod._reset_plaintext_bearer_guard_for_tests()
mod._check_plaintext_bearer_guard("https://remote.example", "secret", warnings.append)
assert warnings == [], warnings

calls = []
def fake_urlopen(req, timeout=0):
    calls.append(req)
    raise AssertionError("request should not be sent")

mod.urlopen = fake_urlopen
os.environ["AGENTMEMORY_REQUIRE_HTTPS"] = "1"
try:
    mod._api("http://remote.example:3111", "health", method="GET", secret="secret")
except RuntimeError as exc:
    assert "plaintext HTTP to http://remote.example:3111" in str(exc), exc
else:
    raise AssertionError("expected RuntimeError")
assert calls == [], calls
`;
    const result = spawnSync("python3", ["-c", script], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: home },
      encoding: "utf8",
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
