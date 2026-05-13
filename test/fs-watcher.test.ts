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

describe("FilesystemWatcher", () => {
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
      await wait(800);
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
      await wait(800);
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
      await wait(800);
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
      await wait(800);
      expect(captured.length).toBeGreaterThanOrEqual(1);
      const headers = captured[captured.length - 1].headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer shhh");
    } finally {
      w.stop();
    }
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

  it("loads watcher settings from ~/.agentmemory/.env", () => {
    const home = tempDir();
    try {
      mkdirSync(join(home, ".agentmemory"), { recursive: true });
      writeFileSync(
        join(home, ".agentmemory", ".env"),
        [
          "AGENTMEMORY_FS_WATCH_DIRS=/srv/project,/srv/notes",
          "AGENTMEMORY_URL=http://agentmemory:3111",
          "AGENTMEMORY_SECRET=from-file",
          "AGENTMEMORY_PROJECT=central",
          "AGENTMEMORY_FS_WATCH_ALLOW_BINARY=1",
        ].join("\n"),
      );

      const cfg = configFromEnv({ HOME: home });

      expect(cfg.roots).toEqual(["/srv/project", "/srv/notes"]);
      expect(cfg.baseUrl).toBe("http://agentmemory:3111");
      expect(cfg.secret).toBe("from-file");
      expect(cfg.project).toBe("central");
      expect(cfg.allowBinary).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("parses env-file quoting, inline comments, open quotes, and empty values", () => {
    const home = tempDir();
    try {
      mkdirSync(join(home, ".agentmemory"), { recursive: true });
      writeFileSync(
        join(home, ".agentmemory", ".env"),
        [
          'AGENTMEMORY_FS_WATCH_DIRS="/srv/incomplete',
          "AGENTMEMORY_URL=http://agentmemory:3111 # shared server",
          'AGENTMEMORY_PROJECT="central project"',
          "AGENTMEMORY_SESSION_ID='watcher session'",
          "AGENTMEMORY_SECRET=",
          "MALFORMED_LINE_WITHOUT_EQUALS",
        ].join("\n"),
      );

      const cfg = configFromEnv({ HOME: home });

      expect(cfg.roots).toEqual(["/srv/incomplete"]);
      expect(cfg.baseUrl).toBe("http://agentmemory:3111");
      expect(cfg.project).toBe("central project");
      expect(cfg.sessionId).toBe("watcher session");
      expect(cfg.secret).toBe("");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("lets XDG_CONFIG_HOME override ~/.agentmemory/.env", () => {
    const home = tempDir();
    const xdg = tempDir();
    try {
      mkdirSync(join(home, ".agentmemory"), { recursive: true });
      mkdirSync(join(xdg, "agentmemory"), { recursive: true });
      writeFileSync(
        join(home, ".agentmemory", ".env"),
        [
          "AGENTMEMORY_FS_WATCH_DIRS=/home/project",
          "AGENTMEMORY_URL=http://home:3111",
          "AGENTMEMORY_SECRET=home-secret",
        ].join("\n"),
      );
      writeFileSync(
        join(xdg, "agentmemory", ".env"),
        [
          "AGENTMEMORY_FS_WATCH_DIRS=/xdg/project",
          "AGENTMEMORY_URL=http://xdg:3111",
          "AGENTMEMORY_SECRET=xdg-secret",
        ].join("\n"),
      );

      const cfg = configFromEnv({ HOME: home, XDG_CONFIG_HOME: xdg });

      expect(cfg.roots).toEqual(["/xdg/project"]);
      expect(cfg.baseUrl).toBe("http://xdg:3111");
      expect(cfg.secret).toBe("xdg-secret");
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(xdg, { recursive: true, force: true });
    }
  });

  it("lets explicit env override ~/.agentmemory/.env", () => {
    const home = tempDir();
    try {
      mkdirSync(join(home, ".agentmemory"), { recursive: true });
      writeFileSync(
        join(home, ".agentmemory", ".env"),
        [
          "AGENTMEMORY_FS_WATCH_DIRS=/srv/project",
          "AGENTMEMORY_URL=http://agentmemory:3111",
          "AGENTMEMORY_SECRET=from-file",
        ].join("\n"),
      );

      const cfg = configFromEnv({
        HOME: home,
        AGENTMEMORY_URL: "http://override:3111",
        AGENTMEMORY_SECRET: "from-env",
      });

      expect(cfg.roots).toEqual(["/srv/project"]);
      expect(cfg.baseUrl).toBe("http://override:3111");
      expect(cfg.secret).toBe("from-env");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
