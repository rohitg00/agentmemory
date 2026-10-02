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

const KEY = "AGENTMEMORY_SECRET";

describe("stored API secret", () => {
  let home: string;
  const saved = {
    home: process.env.HOME,
    profile: process.env.USERPROFILE,
    value: process.env[KEY],
    url: process.env.AGENTMEMORY_URL,
  };

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "am-secret-"));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    delete process.env[KEY];
    delete process.env.AGENTMEMORY_URL;
  });

  afterEach(() => {
    process.env.HOME = saved.home;
    if (saved.profile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = saved.profile;
    if (saved.value === undefined) delete process.env[KEY];
    else process.env[KEY] = saved.value;
    if (saved.url === undefined) delete process.env.AGENTMEMORY_URL;
    else process.env.AGENTMEMORY_URL = saved.url;
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
