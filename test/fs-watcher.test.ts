import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilesystemWatcher, configFromEnv } from "../integrations/filesystem-watcher/watcher.mjs";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "fs-watch-"));
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("FilesystemWatcher", { retry: 2 }, () => {
  let root: string;
  const originalFetch = globalThis.fetch;
  let captured: Array<{ url: string; body: unknown; headers: Record<string, string> }>;

  beforeEach(() => {
    root = tempDir();
    captured = [];
    (globalThis as { fetch: typeof fetch }).fetch = (async (
      url: string | URL,
      init?: RequestInit,
    ) => {
      captured.push({
        url: url.toString(),
        body: init?.body ? JSON.parse(init.body as string) : null,
        headers: (init?.headers || {}) as Record<string, string>,
      });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {}
  });

  it("emits a post_tool_use observation with HookPayload shape on write", async () => {
    const w = new FilesystemWatcher({
      roots: [root],
      baseUrl: "http://localhost:3111",
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    w.start();
    try {
      writeFileSync(join(root, "notes.md"), "hello world\n");
      await wait(1500);
      expect(captured.length).toBeGreaterThanOrEqual(1);
      const obs = captured[captured.length - 1];
      expect(obs.url).toBe("http://localhost:3111/agentmemory/observe");
      const body = obs.body as {
        hookType: string;
        sessionId: string;
        project: string;
        cwd: string;
        timestamp: string;
        data: { changeKind: string; files: string[]; content: string; source: string };
      };
      expect(body.hookType).toBe("post_tool_use");
      expect(typeof body.sessionId).toBe("string");
      expect(body.sessionId.length).toBeGreaterThan(0);
      expect(typeof body.project).toBe("string");
      expect(body.project.length).toBeGreaterThan(0);
      expect(body.cwd).toBe(root);
      expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(body.data.source).toBe("filesystem-watcher");
      expect(body.data.changeKind).toBe("file_change");
      expect(body.data.files).toContain("notes.md");
      expect(body.data.content).toContain("hello world");
    } finally {
      w.stop();
    }
  });

  it("emits changeKind=file_delete when a watched file is removed", async () => {
    writeFileSync(join(root, "old.md"), "bye\n");
    const w = new FilesystemWatcher({
      roots: [root],
      baseUrl: "http://localhost:3111",
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    w.start();
    try {
      unlinkSync(join(root, "old.md"));
      await wait(1500);
      const deletes = captured.filter(
        (c) => (c.body as { data: { changeKind: string } }).data?.changeKind === "file_delete",
      );
      expect(deletes.length).toBeGreaterThanOrEqual(1);
    } finally {
      w.stop();
    }
  });

  it("throws if no watched roots could be attached", () => {
    const w = new FilesystemWatcher({
      roots: ["/definitely/does/not/exist/xyz123"],
      baseUrl: "http://localhost:3111",
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    expect(() => w.start()).toThrow(/could not watch any of the configured roots/);
  });

  it("ignores paths that match the default ignore set", async () => {
    mkdirSync(join(root, "node_modules"), { recursive: true });
    const w = new FilesystemWatcher({
      roots: [root],
      baseUrl: "http://localhost:3111",
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    w.start();
    try {
      writeFileSync(join(root, "node_modules", "ignored.js"), "x");
      await wait(1500);
      const matches = captured.filter((c) =>
        (c.body as { data: { files: string[] } }).data?.files?.some((f) => f.includes("ignored.js")),
      );
      expect(matches).toHaveLength(0);
    } finally {
      w.stop();
    }
  });

  it("attaches Bearer auth when a secret is configured", async () => {
    const w = new FilesystemWatcher({
      roots: [root],
      baseUrl: "http://localhost:3111",
      secret: "shhh",
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    w.start();
    try {
      writeFileSync(join(root, "secret.md"), "bearer test\n");
      await wait(1500);
      expect(captured.length).toBeGreaterThanOrEqual(1);
      const headers = captured[captured.length - 1].headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer shhh");
    } finally {
      w.stop();
    }
  });

  it("redacts sensitive dotenv preview values before sending observations", async () => {
    writeFileSync(
      join(root, ".env"),
      [
        "OPENAI_API_KEY=sk-test-secret-value",
        "PUBLIC_FLAG=enabled",
        "AUTHORIZATION=Bearer live-token-value",
      ].join("\n"),
    );
    const w = new FilesystemWatcher({
      roots: [root],
      baseUrl: "http://localhost:3111",
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    await w.flush(root, ".env");

    expect(captured).toHaveLength(1);
    const content = (captured[0].body as { data: { content: string } }).data.content;
    expect(content).toContain("OPENAI_API_KEY=[REDACTED]");
    expect(content).toContain("PUBLIC_FLAG=enabled");
    expect(content).toContain("AUTHORIZATION=[REDACTED]");
    expect(content).not.toContain("sk-test-secret-value");
    expect(content).not.toContain("live-token-value");
  });

  it("redacts quoted JSON-style sensitive keys before sending observations", async () => {
    writeFileSync(
      join(root, "settings.json"),
      [
        '{',
        '  "api_key": "json-preview-secret",',
        '  "public_flag": "enabled"',
        '}',
      ].join("\n"),
    );
    const w = new FilesystemWatcher({
      roots: [root],
      baseUrl: "http://localhost:3111",
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    await w.flush(root, "settings.json");

    expect(captured).toHaveLength(1);
    const content = (captured[0].body as { data: { content: string } }).data.content;
    expect(content).toContain('"api_key": [REDACTED]');
    expect(content).toContain('"public_flag": "enabled"');
    expect(content).not.toContain("json-preview-secret");
  });

  it("redacts bearer tokens from regular text previews before sending observations", async () => {
    writeFileSync(join(root, "request.txt"), "Authorization: Bearer plaintext-token-value\n");
    const w = new FilesystemWatcher({
      roots: [root],
      baseUrl: "http://localhost:3111",
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    await w.flush(root, "request.txt");

    expect(captured).toHaveLength(1);
    const content = (captured[0].body as { data: { content: string } }).data.content;
    expect(content).toContain("Authorization: Bearer [REDACTED]");
    expect(content).not.toContain("plaintext-token-value");
  });

  it("collapses multi-line PEM private-key blocks while keeping BEGIN/END markers", async () => {
    const dashes = "-".repeat(5);
    const rsaBegin = `${dashes}BEGIN RSA PRIVATE KEY${dashes}`;
    const rsaEnd = `${dashes}END RSA PRIVATE KEY${dashes}`;
    const sshBegin = `${dashes}BEGIN OPENSSH PRIVATE KEY${dashes}`;
    const sshEnd = `${dashes}END OPENSSH PRIVATE KEY${dashes}`;
    writeFileSync(
      join(root, "id_rsa.txt"),
      [
        rsaBegin,
        "MIIEowIBAAKCAQEAuRFakeRsaBodyLine1ShouldNeverLeakToObservationPipeline",
        "MoreFakeBase64BodyForRsaKeyMaterialThatMustStayRedacted",
        "YetAnotherSecretLineOfBase64KeyContentNoOneShouldRead",
        rsaEnd,
        "",
        sshBegin,
        "b3BlbnNzaC1mYWtlLWtleS1ib2R5LWxpbmUtb25l",
        "b3BlbnNzaC1mYWtlLWtleS1ib2R5LWxpbmUtdHdv",
        sshEnd,
        "",
      ].join("\n"),
    );
    const w = new FilesystemWatcher({
      roots: [root],
      baseUrl: "http://localhost:3111",
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    await w.flush(root, "id_rsa.txt");

    expect(captured).toHaveLength(1);
    const content = (captured[0].body as { data: { content: string } }).data.content;
    expect(content).toContain(rsaBegin);
    expect(content).toContain(rsaEnd);
    expect(content).toContain(sshBegin);
    expect(content).toContain(sshEnd);
    expect(content).toContain("[REDACTED]");
    expect(content).not.toContain("MIIEowIBAAKCAQEAuRFakeRsaBodyLine1");
    expect(content).not.toContain("MoreFakeBase64BodyForRsaKeyMaterial");
    expect(content).not.toContain("YetAnotherSecretLineOfBase64KeyContent");
    expect(content).not.toContain("b3BlbnNzaC1mYWtlLWtleS1ib2R5LWxpbmUtb25l");
    expect(content).not.toContain("b3BlbnNzaC1mYWtlLWtleS1ib2R5LWxpbmUtdHdv");
  });

  it("redacts inline PEM blocks embedded in single-line JSON values", async () => {
    const dashes = "-".repeat(5);
    const pemBegin = `${dashes}BEGIN PRIVATE KEY${dashes}`;
    const pemEnd = `${dashes}END PRIVATE KEY${dashes}`;
    const inlinePem = `${pemBegin}\\nMIIEvgIBADANBgkqhkiG9w0FakeServiceAccountBody\\n${pemEnd}`;
    writeFileSync(
      join(root, "service-account.json"),
      `{\n  "type": "service_account",\n  "private_key": "${inlinePem}",\n  "client_email": "demo@example.com"\n}\n`,
    );
    const w = new FilesystemWatcher({
      roots: [root],
      baseUrl: "http://localhost:3111",
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    await w.flush(root, "service-account.json");

    expect(captured).toHaveLength(1);
    const content = (captured[0].body as { data: { content: string } }).data.content;
    expect(content).toContain(pemBegin);
    expect(content).toContain(pemEnd);
    expect(content).toContain("[REDACTED]");
    expect(content).not.toContain("MIIEvgIBADANBgkqhkiG9w0FakeServiceAccountBody");
    expect(content).toContain('"client_email": "demo@example.com"');
  });

  it("redacts standalone JWT-looking strings outside Bearer context", async () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    writeFileSync(
      join(root, "notes.txt"),
      ["session token below:", jwt, "end of token"].join("\n"),
    );
    const w = new FilesystemWatcher({
      roots: [root],
      baseUrl: "http://localhost:3111",
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    await w.flush(root, "notes.txt");

    expect(captured).toHaveLength(1);
    const content = (captured[0].body as { data: { content: string } }).data.content;
    expect(content).toContain("[REDACTED]");
    expect(content).not.toContain(jwt);
    expect(content).toContain("end of token");
  });

  it("does not redact base64-looking words that are not three-segment JWTs of sufficient length", async () => {
    const notJwt = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const shortThreeSegment = "eyJabc.def.ghi";
    expect(notJwt.length).toBe(62);
    expect(shortThreeSegment.length).toBeLessThan(100);
    writeFileSync(
      join(root, "fixture.txt"),
      ["random base64-ish word:", notJwt, "tiny segmented thing:", shortThreeSegment].join("\n"),
    );
    const w = new FilesystemWatcher({
      roots: [root],
      baseUrl: "http://localhost:3111",
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    await w.flush(root, "fixture.txt");

    expect(captured).toHaveLength(1);
    const content = (captured[0].body as { data: { content: string } }).data.content;
    expect(content).toContain(notJwt);
    expect(content).toContain(shortThreeSegment);
    expect(content).not.toContain("[REDACTED]");
  });

  it("debounces rapid writes to a single observation", async () => {
    const w = new FilesystemWatcher({
      roots: [root],
      baseUrl: "http://localhost:3111",
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    w.start();
    try {
      const target = join(root, "burst.md");
      writeFileSync(target, "1\n");
      writeFileSync(target, "2\n");
      writeFileSync(target, "3\n");
      writeFileSync(target, "4\n");
      await wait(900);
      const hits = captured.filter((c) =>
        (c.body as { data: { files: string[] } }).data?.files?.[0] === "burst.md",
      );
      expect(hits.length).toBeLessThanOrEqual(2);
    } finally {
      w.stop();
    }
  });
});

describe("configFromEnv", () => {
  it("parses comma-separated dirs and ignore patterns", () => {
    const cfg = configFromEnv({
      AGENTMEMORY_FS_WATCH_DIRS: " /a , /b ",
      AGENTMEMORY_FS_WATCH_IGNORE: "foo$, ^bar",
      AGENTMEMORY_URL: "http://localhost:3111",
      AGENTMEMORY_SECRET: "tok",
      AGENTMEMORY_PROJECT: "demo",
    });
    expect(cfg.roots).toEqual(["/a", "/b"]);
    expect(cfg.baseUrl).toBe("http://localhost:3111");
    expect(cfg.secret).toBe("tok");
    expect(cfg.project).toBe("demo");
    expect(cfg.ignorePatterns).toHaveLength(2);
    expect(cfg.ignorePatterns[0].test("abcfoo")).toBe(true);
    expect(cfg.ignorePatterns[1].test("barbaz")).toBe(true);
  });

  it("returns empty roots when the env var is missing", () => {
    const cfg = configFromEnv({});
    expect(cfg.roots).toEqual([]);
  });
});
