import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fakeHome = mkdtempSync(join(tmpdir(), "agentmemory-notice-"));

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  return { ...actual, homedir: () => fakeHome };
});

const PROVIDER_ENV = /(API_KEY|_KEY$|_TOKEN$|PROVIDER|_BASE_URL$|^AGENTMEMORY_ALLOW_AGENT_SDK$|^OLLAMA)/;

describe("zero-LLM provider notice", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.resetModules();
    for (const key of Object.keys(process.env)) {
      if (PROVIDER_ENV.test(key)) {
        saved[key] = process.env[key];
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value !== undefined) process.env[key] = value;
    }
    vi.restoreAllMocks();
  });

  it("is printed once per process however often the config is loaded", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const { loadConfig } = await import("../src/config.js");

    for (let i = 0; i < 4; i++) {
      expect(loadConfig().provider.provider).toBe("noop");
    }

    const notices = write.mock.calls.filter((call) =>
      String(call[0]).includes("No LLM provider key set"),
    );
    expect(notices).toHaveLength(1);
  });
});
