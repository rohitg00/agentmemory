import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error -- plain .mjs integration script without type declarations
import { authHeader, parseEnvFile, requireConnection } from "../integrations/cursor/_env.mjs";

describe("cursor integration env file", () => {
  it("strips quotes and inline comments like the daemon", () => {
    const dir = mkdtempSync(join(tmpdir(), "am-cursor-env-"));
    const file = join(dir, ".env");
    writeFileSync(
      file,
      [
        'AGENTMEMORY_URL="http://localhost:3111"',
        "AGENTMEMORY_SECRET='abc'",
        "AGENTMEMORY_TOOLS=all # every tool",
        "export EXTRA=1",
      ].join("\n"),
    );
    try {
      expect(parseEnvFile(file)).toEqual({
        AGENTMEMORY_URL: "http://localhost:3111",
        AGENTMEMORY_SECRET: "abc",
        AGENTMEMORY_TOOLS: "all",
        EXTRA: "1",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("omits the bearer header for a keyless daemon", () => {
    expect(authHeader("")).toEqual({});
    expect(authHeader("abc")).toEqual({ Authorization: "Bearer abc" });
  });
});


describe('cursor local credentials', () => {
  let home: string;
  let envPath: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'am-cursor-auth-')); mkdirSync(join(home, '.agentmemory'));
    envPath = join(home, '.agentmemory/.env');
    writeFileSync(envPath, 'AGENTMEMORY_URL=http://127.0.0.1:3111\n');
    writeFileSync(join(home, '.agentmemory/secret'), 'stored-fixture');
    vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
    vi.stubEnv('AGENTMEMORY_URL', ''); vi.stubEnv('AGENTMEMORY_SECRET', ''); vi.stubEnv('AGENTMEMORY_CREDENTIAL_MODE', '');
  });
  afterEach(() => { vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true }); });
  it('uses the generated local secret when the env file has none', () => {
    expect(requireConnection(envPath).secret).toBe('stored-fixture');
  });
  it('does not send file credentials to a remote URL or in explicit-only mode', () => {
    writeFileSync(envPath, 'AGENTMEMORY_URL=http://127.0.0.1:3111\nAGENTMEMORY_SECRET=local-fixture\n');
    vi.stubEnv('AGENTMEMORY_URL', 'https://remote.example'); expect(requireConnection(envPath).secret).toBe('');
    vi.stubEnv('AGENTMEMORY_URL', 'http://127.0.0.1:3111'); vi.stubEnv('AGENTMEMORY_CREDENTIAL_MODE', 'explicit');
    expect(requireConnection(envPath).secret).toBe('');
    vi.stubEnv('AGENTMEMORY_SECRET', 'explicit-fixture'); expect(requireConnection(envPath).secret).toBe('explicit-fixture');
  });
});
