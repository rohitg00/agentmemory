import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilesystemWatcher } from "../integrations/filesystem-watcher/watcher.mjs";
import { resolveSecret as openclawSecret } from "../integrations/openclaw/plugin.mjs";
import { resolveSecret as piSecret } from "../integrations/pi/security.ts";

const KEY = "AGENTMEMORY_SECRET";
const LOCAL = "http://127.0.0.1:3111";

type Resolver = (url: string, explicit?: string) => string;

const resolvers: Array<[string, Resolver]> = [
  ["filesystem watcher", (url, explicit) => new FilesystemWatcher({ baseUrl: url, secret: explicit }).secret],
  ["openclaw", openclawSecret as Resolver],
  ["pi", piSecret],
];

function hasPython(): boolean {
  return spawnSync("python3", ["--version"], { stdio: "ignore" }).status === 0;
}

function hermesSecret(home: string, url: string, explicit?: string): string {
  const script = [
    "import importlib.util, sys",
    "spec = importlib.util.spec_from_file_location('hermes_plugin', sys.argv[1])",
    "mod = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(mod)",
    "import os",
    "print(mod._usable_secret(os.environ.get('AGENTMEMORY_SECRET')) or mod._stored_secret(sys.argv[2]))",
  ].join("\n");
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: home, USERPROFILE: home };
  if (explicit !== undefined) env[KEY] = explicit;
  const result = spawnSync("python3", ["-c", script, join(process.cwd(), "integrations", "hermes", "__init__.py"), url], {
    env,
    encoding: "utf-8",
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

describe("client secret resolution", () => {
  let home: string;
  const saved = { home: process.env.HOME, profile: process.env.USERPROFILE, value: process.env[KEY] };

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "am-client-secret-"));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    delete process.env[KEY];
    mkdirSync(join(home, ".agentmemory"), { recursive: true });
  });

  afterEach(() => {
    process.env.HOME = saved.home;
    if (saved.profile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = saved.profile;
    if (saved.value === undefined) delete process.env[KEY];
    else process.env[KEY] = saved.value;
    rmSync(home, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  function writeSecrets(envFile?: string) {
    writeFileSync(join(home, ".agentmemory", "secret"), "generated-secret\n");
    if (envFile !== undefined) writeFileSync(join(home, ".agentmemory", ".env"), envFile);
  }

  describe.each(resolvers)("%s", (_name, resolve) => {
    it("prefers the explicit secret", () => {
      writeSecrets('AGENTMEMORY_SECRET="from-env-file"\n');
      expect(resolve(LOCAL, "explicit-value")).toBe("explicit-value");
    });

    it("reads ~/.agentmemory/.env before the generated secret", () => {
      writeSecrets('AGENTMEMORY_SECRET="from-env-file"\n');
      expect(resolve(LOCAL)).toBe("from-env-file");
    });

    it("treats placeholders as unset", () => {
      writeSecrets("AGENTMEMORY_SECRET=${AGENTMEMORY_SECRET}\n");
      expect(resolve(LOCAL, "${AGENTMEMORY_SECRET}")).toBe("generated-secret");
    });

    it("reads stored files for every loopback address only", () => {
      writeSecrets();
      expect(resolve("http://127.0.0.2:3111")).toBe("generated-secret");
      expect(resolve("http://[::1]:3111")).toBe("generated-secret");
      expect(resolve("http://localhost:3111")).toBe("generated-secret");
      expect(resolve("https://memory.example.com")).toBe("");
      expect(resolve("http://localhost.example.com:3111")).toBe("");
    });
  });

  it("opencode plugin sends the secret from ~/.agentmemory/.env", async () => {
    writeSecrets('AGENTMEMORY_SECRET="from-env-file"\n');
    process.env[KEY] = "${AGENTMEMORY_SECRET}";
    const seen: Array<Record<string, string>> = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      seen.push((init?.headers || {}) as Record<string, string>);
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.resetModules();
    const mod = await import("../plugin/opencode/agentmemory-capture.ts");
    const hooks = await mod.AgentmemoryCapturePlugin({ worktree: home } as never);
    await hooks.event?.({ event: { type: "session.status", properties: { sessionID: "ses_x", status: { type: "busy" } } } } as never);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]?.Authorization).toBe("Bearer from-env-file");
  });

  it.skipIf(!hasPython())("hermes follows the same order and keeps its loopback restriction", () => {
    writeSecrets('AGENTMEMORY_SECRET="from-env-file"\n');
    expect(hermesSecret(home, LOCAL)).toBe("from-env-file");
    expect(hermesSecret(home, LOCAL, "explicit-value")).toBe("explicit-value");
    expect(hermesSecret(home, "https://memory.example.com", "${AGENTMEMORY_SECRET}")).toBe("");
    writeFileSync(join(home, ".agentmemory", ".env"), "AGENTMEMORY_SECRET=${AGENTMEMORY_SECRET}\n");
    expect(hermesSecret(home, LOCAL)).toBe("generated-secret");
    expect(hermesSecret(home, "https://memory.example.com")).toBe("");
  });
});
