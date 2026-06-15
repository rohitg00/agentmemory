import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import openclawPlugin from "../integrations/openclaw/plugin.mjs";
import { createPlaintextBearerAuthGuard } from "../integrations/pi/security.ts";

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
    await handlers.get("before_agent_start")?.({ prompt: "recall auth work" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns once and skips requests for non-loopback HTTP with a bearer secret", async () => {
    const fetchMock = mockFetch();
    const { handlers, warn } = registerOpenClaw("http://remote.example:3111");
    await handlers.get("before_agent_start")?.({ prompt: "first" });
    await handlers.get("before_agent_start")?.({ prompt: "second" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("plaintext HTTP to http://remote.example:3111");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps HTTPS with a bearer secret silent", async () => {
    const { handlers, warn } = registerOpenClaw("https://remote.example");
    await handlers.get("before_agent_start")?.({ prompt: "recall auth work" });
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
  it("keeps loopback HTTP silent", () => {
    const warn = vi.fn();
    const guard = createPlaintextBearerAuthGuard(warn, {});
    expect(guard("http://127.0.0.1:3111", "secret")).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns once and blocks non-loopback HTTP with a bearer secret", () => {
    const warn = vi.fn();
    const guard = createPlaintextBearerAuthGuard(warn, {});
    expect(guard("http://remote.example:3111", "secret")).toBe(false);
    expect(guard("http://remote.example:3111", "secret")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("plaintext HTTP to http://remote.example:3111");
  });

  it("keeps HTTPS with a bearer secret silent", () => {
    const warn = vi.fn();
    const guard = createPlaintextBearerAuthGuard(warn, {});
    expect(guard("https://remote.example", "secret")).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("fails before callers can issue a request when HTTPS is required", () => {
    const warn = vi.fn();
    const guard = createPlaintextBearerAuthGuard(warn, {
      AGENTMEMORY_REQUIRE_HTTPS: "1",
    });
    expect(() => guard("http://remote.example:3111", "secret")).toThrow(
      /plaintext HTTP to http:\/\/remote\.example:3111/,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("treats IPv6 loopback ([::1]) as loopback (URL parser strips brackets)", () => {
    const warn = vi.fn();
    const guard = createPlaintextBearerAuthGuard(warn, {});
    expect(guard("http://[::1]:3111", "secret")).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns for private LAN IPs — RFC1918 ranges are NOT loopback", () => {
    const warn = vi.fn();
    const guard = createPlaintextBearerAuthGuard(warn, {});
    expect(guard("http://192.168.1.50:3111", "secret")).toBe(false);
    expect(guard("http://10.0.0.42:3111", "secret")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1); // warn-once
    expect(warn.mock.calls[0][0]).toContain("plaintext HTTP to http://192.168.1.50:3111");
  });

  it("does not warn when no secret is set — guard only fires when a bearer would actually be sent", () => {
    const warn = vi.fn();
    const guard = createPlaintextBearerAuthGuard(warn, {});
    expect(guard("http://remote.example:3111", "")).toBe(true);
    expect(guard("http://remote.example:3111", undefined)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("treats hostnames that LOOK loopback but aren't (localhost.evil.com) as remote", () => {
    const warn = vi.fn();
    const guard = createPlaintextBearerAuthGuard(warn, {});
    expect(guard("http://localhost.evil.com:3111", "secret")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("OpenCode plaintext bearer guard", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  async function loadOpenCodePlugin() {
    vi.resetModules();
    const mod = await import("../plugin/opencode/agentmemory-capture.ts");
    return mod.AgentmemoryCapturePlugin as (ctx: {
      worktree?: string;
      project?: { id?: string };
    }) => Promise<{
      event: (input: { event: Record<string, unknown> }) => Promise<void>;
    }>;
  }

  it("skips session capture for non-loopback HTTP with a bearer secret", async () => {
    process.env = {
      ...originalEnv,
      AGENTMEMORY_URL: "http://remote.example:3111",
      AGENTMEMORY_SECRET: "secret",
    };
    const fetchMock = mockFetch();
    const pluginFactory = await loadOpenCodePlugin();
    const plugin = await pluginFactory({ worktree: "/tmp/project" });

    await plugin.event({
      event: {
        type: "session.created",
        properties: { info: { id: "ses-1", title: "remote" } },
      },
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows loopback HTTP with a bearer secret", async () => {
    process.env = {
      ...originalEnv,
      AGENTMEMORY_URL: "http://localhost:3111",
      AGENTMEMORY_SECRET: "secret",
    };
    const fetchMock = mockFetch();
    const pluginFactory = await loadOpenCodePlugin();
    const plugin = await pluginFactory({ worktree: "/tmp/project" });

    await plugin.event({
      event: {
        type: "session.created",
        properties: { info: { id: "ses-1", title: "loopback" } },
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer secret",
    });
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
assert mod._check_plaintext_bearer_guard("http://localhost:3111", "secret", warnings.append) is True
assert warnings == [], warnings

mod._reset_plaintext_bearer_guard_for_tests()
assert mod._check_plaintext_bearer_guard("http://remote.example:3111", "secret", warnings.append) is False
assert mod._check_plaintext_bearer_guard("http://remote.example:3111", "secret", warnings.append) is False
assert len(warnings) == 1, warnings
assert "plaintext HTTP to http://remote.example:3111" in warnings[0], warnings

warnings = []
mod._reset_plaintext_bearer_guard_for_tests()
assert mod._check_plaintext_bearer_guard("https://remote.example", "secret", warnings.append) is True
assert warnings == [], warnings

calls = []
def fake_urlopen(req, timeout=0):
    calls.append(req)
    raise AssertionError("request should not be sent")

mod.urlopen = fake_urlopen
mod._reset_plaintext_bearer_guard_for_tests()
result = mod._api("http://remote.example:3111", "health", method="GET", secret="secret")
assert result is None, result
assert calls == [], calls

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

  it("uses saved Hermes config for runtime URL and secret when env vars are absent", () => {
    const script = String.raw`
import importlib.util
import os
import time
from pathlib import Path

for key in ("AGENTMEMORY_SECRET", "AGENTMEMORY_URL", "AGENTMEMORY_REQUIRE_HTTPS"):
    os.environ.pop(key, None)

spec = importlib.util.spec_from_file_location("agentmemory_hermes", "integrations/hermes/__init__.py")
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)

provider = mod.AgentMemoryProvider()
hermes_home = Path(os.environ["HOME"]) / "custom-hermes"
hermes_home.mkdir()
provider.save_config({"url": "https://memory.example", "secret": "saved-secret"}, str(hermes_home))

calls = []
def fake_api(base, path, body=None, method="POST", secret=""):
    calls.append({"base": base, "path": path, "secret": secret})
    return {
        "context": "saved context",
        "results": [{"title": "Saved", "narrative": "Configured runtime", "combinedScore": 1}],
        "success": True,
    }

mod._api = fake_api
assert provider.is_available() is True
provider.initialize("session-658", hermes_home=str(hermes_home), cwd="/tmp/project")
assert provider.system_prompt_block() == "saved context"
assert provider.prefetch("saved") == "- Saved: Configured runtime"
provider.queue_prefetch("saved")
provider.handle_tool_call("memory_recall", {"query": "saved"})
provider.handle_tool_call("memory_save", {"content": "saved"})
provider.handle_tool_call("memory_search", {"query": "saved"})
provider.sync_turn("user", "assistant")
provider.on_session_end([])
messages = []
provider.on_pre_compress(messages)
provider.on_memory_write("add", "MEMORY.md", "saved memory")
time.sleep(0.2)

assert provider._base == "https://memory.example", provider._base
assert provider._secret == "saved-secret", provider._secret
assert len(calls) >= 10, calls
assert all(call["base"] == "https://memory.example" for call in calls), calls
assert all(call["secret"] == "saved-secret" for call in calls), calls
assert messages[0]["content"].endswith("saved context"), messages
`;
    const result = spawnSync("python3", ["-c", script], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: home },
      encoding: "utf8",
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it("lets env URL and secret override saved Hermes config", () => {
    const script = String.raw`
import importlib.util
import os
from pathlib import Path

for key in ("AGENTMEMORY_SECRET", "AGENTMEMORY_URL", "AGENTMEMORY_REQUIRE_HTTPS"):
    os.environ.pop(key, None)
os.environ["AGENTMEMORY_URL"] = "https://env.example"
os.environ["AGENTMEMORY_SECRET"] = "env-secret"

spec = importlib.util.spec_from_file_location("agentmemory_hermes", "integrations/hermes/__init__.py")
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)

provider = mod.AgentMemoryProvider()
hermes_home = Path(os.environ["HOME"]) / "custom-hermes"
hermes_home.mkdir()
provider.save_config({"url": "https://memory.example", "secret": "saved-secret"}, str(hermes_home))

calls = []
def fake_api(base, path, body=None, method="POST", secret=""):
    calls.append({"base": base, "path": path, "secret": secret})
    return {}

mod._api = fake_api
provider.initialize("session-658", hermes_home=str(hermes_home), cwd="/tmp/project")

assert provider._base == "https://env.example", provider._base
assert provider._secret == "env-secret", provider._secret
assert calls[0]["base"] == "https://env.example", calls
assert calls[0]["secret"] == "env-secret", calls
`;
    const result = spawnSync("python3", ["-c", script], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: home },
      encoding: "utf8",
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it("falls back safely when saved Hermes config is malformed", () => {
    const script = String.raw`
import importlib.util
import os
from pathlib import Path

for key in ("AGENTMEMORY_SECRET", "AGENTMEMORY_URL", "AGENTMEMORY_REQUIRE_HTTPS"):
    os.environ.pop(key, None)

spec = importlib.util.spec_from_file_location("agentmemory_hermes", "integrations/hermes/__init__.py")
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)

provider = mod.AgentMemoryProvider()
hermes_home = Path(os.environ["HOME"]) / "custom-hermes"
hermes_home.mkdir()
(hermes_home / "agentmemory.json").write_text("{not json", encoding="utf-8")

calls = []
def fake_api(base, path, body=None, method="POST", secret=""):
    calls.append({"base": base, "path": path, "secret": secret})
    return {}

mod._api = fake_api
provider.initialize("session-658", hermes_home=str(hermes_home), cwd="/tmp/project")

assert provider._base == "http://localhost:3111", provider._base
assert provider._secret == "", provider._secret
assert calls[0]["base"] == "http://localhost:3111", calls
assert calls[0]["secret"] == "", calls
`;
    const result = spawnSync("python3", ["-c", script], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: home },
      encoding: "utf8",
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });

  it("uses the provider Hermes home when checking availability", () => {
    const script = String.raw`
import importlib.util
import os
from pathlib import Path

for key in ("AGENTMEMORY_SECRET", "AGENTMEMORY_URL", "AGENTMEMORY_REQUIRE_HTTPS"):
    os.environ.pop(key, None)

spec = importlib.util.spec_from_file_location("agentmemory_hermes", "integrations/hermes/__init__.py")
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)

provider = mod.AgentMemoryProvider()
default_hermes_home = Path(os.environ["HOME"]) / ".hermes"
default_hermes_home.mkdir()
(default_hermes_home / "agentmemory.json").write_text('{"url":"https://default.example"}', encoding="utf-8")

custom_hermes_home = Path(os.environ["HOME"]) / "custom-hermes"
custom_hermes_home.mkdir()
provider.save_config({"url": "not a url"}, str(custom_hermes_home))

assert provider.is_available() is False
`;
    const result = spawnSync("python3", ["-c", script], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: home },
      encoding: "utf8",
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
  });
});
