import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensureServerSecret,
  isLoopbackUrl,
  resolveClientSecret,
  secretFilePath,
} from "../src/secret-store.js";
import { resetHandleForTests, resolveHandle, setLivezProbe } from "../src/mcp/rest-proxy.js";
import { resolveDataDir } from "../src/cli-data-dir.js";

const KEY = "AGENTMEMORY_SECRET";

describe("stored API secret", () => {
  let home: string;
  const saved = {
    home: process.env.HOME,
    profile: process.env.USERPROFILE,
    value: process.env[KEY],
    url: process.env.AGENTMEMORY_URL,
    dataDir: process.env.AGENTMEMORY_DATA_DIR,
  };

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "am-secret-"));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    delete process.env[KEY];
    delete process.env.AGENTMEMORY_URL;
    delete process.env.AGENTMEMORY_DATA_DIR;
  });

  afterEach(() => {
    process.env.HOME = saved.home;
    if (saved.profile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = saved.profile;
    if (saved.value === undefined) delete process.env[KEY];
    else process.env[KEY] = saved.value;
    if (saved.url === undefined) delete process.env.AGENTMEMORY_URL;
    else process.env.AGENTMEMORY_URL = saved.url;
    if (saved.dataDir === undefined) delete process.env.AGENTMEMORY_DATA_DIR;
    else process.env.AGENTMEMORY_DATA_DIR = saved.dataDir;
    rmSync(home, { recursive: true, force: true });
  });

  it("generates a secret on first run, stores it with mode 0600 and reuses it", () => {
    const first = ensureServerSecret();
    expect(first.source).toBe("generated");
    expect(first.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(secretFilePath()).toBe(join(home, ".agentmemory", "secret"));
    if (process.platform !== "win32") {
      expect(statSync(secretFilePath()).mode & 0o777).toBe(0o600);
    }
    const second = ensureServerSecret();
    expect(second).toEqual({ secret: first.secret, source: "file" });
    expect(readFileSync(secretFilePath(), "utf-8").trim()).toBe(first.secret);
  });

  it("uses an existing canonical secret for a second instance client", () => {
    const canonicalPath = join(home, ".agentmemory", "secret");
    mkdirSync(join(home, ".agentmemory"), { recursive: true });
    writeFileSync(canonicalPath, "canonical-instance-secret\n");
    const customDataDir = join(home, "instance-2");
    process.env.AGENTMEMORY_DATA_DIR = customDataDir;

    const server = ensureServerSecret();
    expect(server).toEqual({ secret: "canonical-instance-secret", source: "file" });
    expect(readFileSync(join(customDataDir, "secret"), "utf-8").trim()).toBe(server.secret);
    expect(resolveClientSecret("http://localhost:3211", { AGENTMEMORY_DATA_DIR: customDataDir })).toBe(server.secret);
  });

  it("creates the local and canonical secret files for an instance without a canonical secret", () => {
    const customDataDir = join(home, "instance-3");
    process.env.AGENTMEMORY_DATA_DIR = customDataDir;
    const { secret } = ensureServerSecret();
    expect(readFileSync(join(customDataDir, "secret"), "utf-8").trim()).toBe(secret);
    expect(readFileSync(join(home, ".agentmemory", "secret"), "utf-8").trim()).toBe(secret);
  });

  it("keeps a custom data-dir secret readable by clients without that override", () => {
    const customDataDir = join(home, "custom-state");
    process.env.AGENTMEMORY_DATA_DIR = customDataDir;
    const { secret } = ensureServerSecret();
    expect(secretFilePath()).toBe(join(customDataDir, "secret"));
    expect(readFileSync(secretFilePath(), "utf-8").trim()).toBe(secret);
    expect(readFileSync(join(home, ".agentmemory", "secret"), "utf-8").trim()).toBe(secret);
    delete process.env.AGENTMEMORY_DATA_DIR;
    expect(resolveClientSecret("http://localhost:3211")).toBe(secret);
    expect(resolveClientSecret("http://localhost:3211", { AGENTMEMORY_DATA_DIR: customDataDir })).toBe(secret);
  });

  it("shares the secret for a resolved --instance data directory", () => {
    const instance = resolveDataDir({ args: ["--instance", "2"], env: {}, home, cwd: home, platform: "linux" });
    expect(instance.dataDir).toBe(join(home, ".local", "share", "agentmemory", "instance-2"));
    process.env.AGENTMEMORY_DATA_DIR = instance.dataDir;
    const { secret } = ensureServerSecret();
    expect(secretFilePath()).toBe(join(instance.dataDir, "secret"));
    expect(readFileSync(join(home, ".agentmemory", "secret"), "utf-8").trim()).toBe(secret);
    delete process.env.AGENTMEMORY_DATA_DIR;
    expect(resolveClientSecret("http://localhost:3311")).toBe(secret);
    expect(resolveClientSecret("http://localhost:3311", { AGENTMEMORY_DATA_DIR: instance.dataDir })).toBe(secret);
  });

  it("migrates an existing data-dir secret to the shared client-visible path", () => {
    const customDataDir = join(home, "custom-state");
    mkdirSync(customDataDir, { recursive: true });
    writeFileSync(join(customDataDir, "secret"), "existing-custom-secret\n");
    process.env.AGENTMEMORY_DATA_DIR = customDataDir;
    expect(ensureServerSecret()).toEqual({ secret: "existing-custom-secret", source: "file" });
    delete process.env.AGENTMEMORY_DATA_DIR;
    expect(resolveClientSecret("http://localhost:3211")).toBe("existing-custom-secret");
  });

  it("uses the canonical winning secret when first starts race across data directories", async () => {
    const barrier = join(home, "secret-link-barrier");
    mkdirSync(barrier, { recursive: true });
    const canonicalPath = join(home, ".agentmemory", "secret");
    const childScript = `
      import fs from "node:fs";
      import { syncBuiltinESMExports } from "node:module";
      import { resolve } from "node:path";
      const originalLink = fs.linkSync.bind(fs);
      fs.linkSync = (source, target) => {
        if (target === process.env.CANONICAL_SECRET) {
          fs.writeFileSync(resolve(process.env.SECRET_BARRIER, process.env.BARRIER_MARKER), "ready");
          const deadline = Date.now() + 10000;
          while (Date.now() < deadline && !["a", "b"].every((name) => fs.existsSync(resolve(process.env.SECRET_BARRIER, name)))) {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
          }
          if (!["a", "b"].every((name) => fs.existsSync(resolve(process.env.SECRET_BARRIER, name)))) throw new Error("barrier timed out");
        }
        return originalLink(source, target);
      };
      syncBuiltinESMExports();
      const { ensureServerSecret, resolveClientSecret } = await import(${JSON.stringify(new URL("../src/secret-store.ts", import.meta.url).href)});
      const server = ensureServerSecret();
      console.log(JSON.stringify({ server: server.secret, client: resolveClientSecret("http://127.0.0.1:3111") }));
    `;
    const run = (name: "a" | "b") => new Promise<{ server: string; client: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", childScript], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          AGENTMEMORY_DATA_DIR: join(home, `data-${name}`),
          CANONICAL_SECRET: canonicalPath,
          SECRET_BARRIER: barrier,
          BARRIER_MARKER: name,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => stdout += chunk);
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => stderr += chunk);
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code !== 0) reject(new Error(`secret race child ${name} failed (${code}): ${stderr}`));
        else {
          try { resolve(JSON.parse(stdout.trim()) as { server: string; client: string }); }
          catch (error) { reject(error); }
        }
      });
    });
    const results = await Promise.all([run("a"), run("b")]);
    for (const result of results) expect(result.server).toBe(result.client);
    expect(results[0]!.server).toBe(results[1]!.server);
  });

  it("migrates a legacy platform .hmac from the data directory without regenerating it", () => {
    const customDataDir = join(home, "platform-data");
    mkdirSync(customDataDir, { recursive: true });
    writeFileSync(join(customDataDir, ".hmac"), "legacy-platform-secret\n");
    process.env.AGENTMEMORY_DATA_DIR = customDataDir;
    const migrated = ensureServerSecret();
    expect(migrated.source).toBe("file");
    expect(migrated.secret).toBe("legacy-platform-secret");
    expect(readFileSync(join(customDataDir, "secret"), "utf-8").trim()).toBe(migrated.secret);
    expect(readFileSync(join(home, ".agentmemory", "secret"), "utf-8").trim()).toBe(migrated.secret);
  });

  it("migrates a legacy platform .hmac in the data directory parent", () => {
    const customDataDir = join(home, "platform", "data");
    mkdirSync(join(home, "platform"), { recursive: true });
    writeFileSync(join(home, "platform", ".hmac"), "legacy-parent-secret\n");
    process.env.AGENTMEMORY_DATA_DIR = customDataDir;
    const migrated = ensureServerSecret();
    expect(migrated.source).toBe("file");
    expect(migrated.secret).toBe("legacy-parent-secret");
  });

  it("preserves explicit secret overrides over a legacy platform .hmac", () => {
    const customDataDir = join(home, "platform-data");
    mkdirSync(customDataDir, { recursive: true });
    writeFileSync(join(customDataDir, ".hmac"), "legacy-platform-secret\n");
    process.env.AGENTMEMORY_DATA_DIR = customDataDir;
    process.env[KEY] = "explicit-override";
    expect(ensureServerSecret()).toEqual({ secret: "explicit-override", source: "env" });
    expect(readFileSync(join(customDataDir, ".hmac"), "utf-8").trim()).toBe("legacy-platform-secret");
  });

  it("lets an explicit secret win over the stored one", () => {
    ensureServerSecret();
    process.env[KEY] = "explicit-value";
    expect(ensureServerSecret()).toEqual({ secret: "explicit-value", source: "env" });
    expect(resolveClientSecret("http://localhost:3111")).toBe("explicit-value");
  });

  it("reads a secret set in ~/.agentmemory/.env before the generated file", () => {
    ensureServerSecret();
    writeFileSync(join(home, ".agentmemory", ".env"), 'AGENTMEMORY_SECRET="from-env-file"\n');
    expect(ensureServerSecret().secret).toBe("from-env-file");
    expect(resolveClientSecret("http://127.0.0.1:3111")).toBe("from-env-file");
  });

  it("explicit credential mode never borrows daemon files, including unresolved host references", () => {
    ensureServerSecret();
    writeFileSync(join(home, ".agentmemory", ".env"), "AGENTMEMORY_SECRET=unrelated-profile\n");
    const env = { AGENTMEMORY_CREDENTIAL_MODE: "explicit" };
    expect(resolveClientSecret("http://localhost:3111", env)).toBe("");
    expect(resolveClientSecret("http://localhost:3111", { ...env, AGENTMEMORY_SECRET: "${AGENTMEMORY_SECRET}" })).toBe("");
    expect(resolveClientSecret("http://localhost:3111", { ...env, AGENTMEMORY_SECRET: "profile-key" })).toBe("profile-key");
  });

  it("treats unexpanded placeholders as unset", () => {
    const { secret } = ensureServerSecret();
    process.env[KEY] = "${AGENTMEMORY_SECRET}";
    expect(resolveClientSecret("http://localhost:3111")).toBe(secret);
  });

  it("only hands the stored secret to loopback servers", () => {
    const { secret } = ensureServerSecret();
    expect(resolveClientSecret("http://localhost:3111")).toBe(secret);
    expect(resolveClientSecret("http://[::1]:3111")).toBe(secret);
    expect(resolveClientSecret("https://memory.example.com")).toBe("");
    expect(isLoopbackUrl("http://127.0.0.2:3111")).toBe(true);
    expect(isLoopbackUrl("http://localhost.example.com")).toBe(false);
  });

  it("returns nothing when no secret has been generated yet", () => {
    mkdirSync(join(home, ".agentmemory"), { recursive: true });
    expect(resolveClientSecret("http://localhost:3111")).toBe("");
  });

  it("the MCP proxy sends the stored secret", async () => {
    const { secret } = ensureServerSecret();
    process.env.AGENTMEMORY_URL = "http://127.0.0.1:59999";
    const seen: Record<string, string>[] = [];
    resetHandleForTests();
    setLivezProbe(async (_url, _timeout, headers) => {
      seen.push(headers);
      return { ok: false, status: 503 };
    });
    try {
      await resolveHandle();
    } finally {
      resetHandleForTests();
    }
    expect(seen[0]?.authorization).toBe(`Bearer ${secret}`);
  });

  describe("bundled hooks", () => {
    let server: Server;
    let received: IncomingHttpHeaders[];

    beforeEach(async () => {
      received = [];
      server = createServer((req, res) => {
        received.push(req.headers);
        req.resume();
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end("{}");
        });
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    });

    afterEach(async () => {
      await new Promise((resolve) => server.close(() => resolve(null)));
    });

    function runHook(script: string, env: NodeJS.ProcessEnv): Promise<number | null> {
      return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [script], { env, stdio: ["pipe", "ignore", "ignore"] });
        child.on("error", reject);
        child.on("exit", (code) => resolve(code));
        child.stdin.end(JSON.stringify({ session_id: "ses_hook_secret", cwd: home }));
      });
    }

    it("send the stored secret without any client configuration", async () => {
      const { secret } = ensureServerSecret();
      const port = (server.address() as AddressInfo).port;
      const env: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        HOME: home,
        USERPROFILE: home,
        AGENTMEMORY_URL: `http://127.0.0.1:${port}`,
      };
      await runHook(join(process.cwd(), "plugin", "scripts", "session-start.mjs"), env);
      expect(received.length).toBeGreaterThan(0);
      expect(received[0]?.authorization).toBe(`Bearer ${secret}`);
      expect(received[0]?.origin).toBeUndefined();
      expect(received[0]?.["content-type"]).toBe("application/json");
    });
  });
});
