import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mockKV, mockSdk } from "./helpers/mocks.js";
import { drainInProgress } from "../src/capture/spool.js";
import { KV } from "../src/state/schema.js";
import type { CompressedObservation, MemoryProvider, Session } from "../src/types.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const HOOK = join(import.meta.dirname, "..", "plugin", "scripts", "stop.mjs");
const SESSION = "ses_stop_reply";
const OBSERVE_TIMEOUT_MS = 2000;
const EXIT_CAP_MS = 3500;

type Received = { path: string; body: Record<string, unknown>; auth?: string; at: number; answeredAt?: number };

type Daemon = {
  port: number;
  kv: ReturnType<typeof mockKV>;
  received: Received[];
  call: (id: string, payload: unknown) => Promise<any>;
  close: () => Promise<void>;
};

const ROUTES: Record<string, string> = {
  "/agentmemory/observe": "api::observe",
  "/agentmemory/session/end": "api::session::end",
};

let home: string;
const daemons: Daemon[] = [];
const hookPorts = new Set<number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (check()) return true;
    await sleep(50);
  }
  return check();
}

function provider(compress?: (prompt: string) => string): MemoryProvider {
  return {
    name: "test",
    compress: vi.fn(async (_system: string, prompt: string) => (compress ? compress(prompt) : "")),
    summarize: vi.fn(async () => ""),
  };
}

async function startDaemon(
  options: {
    port?: number;
    observeDelayMs?: number;
    hangObserve?: boolean;
    hangSessionEnd?: boolean;
    llm?: MemoryProvider;
  } = {},
): Promise<Daemon> {
  vi.resetModules();
  const { registerObserveFunction } = await import("../src/functions/observe.js");
  const { registerCaptureFunctions } = await import("../src/functions/capture.js");
  const { registerCompressFunction } = await import("../src/functions/compress.js");
  const { registerSummarizeFunction } = await import("../src/functions/summarize.js");
  const { registerSearchFunction } = await import("../src/functions/search.js");
  const { registerApiTriggers } = await import("../src/triggers/api.js");
  const { registerEventTriggers } = await import("../src/triggers/events.js");
  const kv = mockKV();
  const sdk = mockSdk({ looseTrigger: true });
  const invoke = sdk.trigger;
  sdk.trigger = (async (input: Parameters<typeof invoke>[0], data?: unknown) => {
    if (typeof input === "object" && input.action) {
      void invoke(input).catch(() => {});
      return undefined;
    }
    return invoke(input, data);
  }) as typeof invoke;
  const llm = options.llm ?? provider();
  registerObserveFunction(sdk as never, kv as never);
  registerCaptureFunctions(sdk as never, kv as never, { durableAfterMs: 0 });
  registerCompressFunction(sdk as never, kv as never, llm);
  registerSummarizeFunction(sdk as never, kv as never, llm);
  registerSearchFunction(sdk as never, kv as never);
  registerApiTriggers(sdk as never, kv as never);
  registerEventTriggers(sdk as never, kv as never);
  const call = (id: string, payload: unknown) => sdk.trigger(id, payload) as Promise<any>;
  const received: Received[] = [];
  const server: Server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", async () => {
      const entry: Received = { path: req.url ?? "", body: JSON.parse(raw || "{}"), auth: req.headers.authorization, at: Date.now() };
      received.push(entry);
      if (entry.path === "/agentmemory/observe") {
        if (options.hangObserve) return;
        if (options.observeDelayMs) await sleep(options.observeDelayMs);
      }
      if (entry.path === "/agentmemory/session/end" && options.hangSessionEnd) return;
      const route = ROUTES[entry.path];
      const response = route ? await call(route, { body: entry.body, headers: {} }) : { status_code: 404, body: {} };
      entry.answeredAt = Date.now();
      res.writeHead(response.status_code, { "content-type": "application/json" });
      res.end(JSON.stringify(response.body ?? {}));
    });
  });
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", () => resolve()));
  const port = (server.address() as { port: number }).port;
  const daemon: Daemon = {
    port,
    kv,
    received,
    call,
    close: () => {
      server.closeAllConnections();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
  daemons.push(daemon);
  return daemon;
}

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", () => resolve()));
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

function runHook(
  port: number,
  payload: Record<string, unknown>,
  env: Record<string, string> = {},
): Promise<{ code: number | null; startedAt: number; ms: number }> {
  const startedAt = Date.now();
  hookPorts.add(port);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK], {
      env: {
        PATH: process.env["PATH"] ?? "",
        HOME: home,
        AGENTMEMORY_URL: `http://127.0.0.1:${port}`,
        AGENTMEMORY_CAPTURE_SPOOL_DIR: join(home, "spool"),
        ...env,
      },
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, startedAt, ms: Date.now() - startedAt }));
    child.stdin.end(JSON.stringify(payload));
  });
}

function stop(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    session_id: SESSION,
    prompt_id: "6f1c2a8e-5b7d-4c11-9a3e-2d4f6b8c0e12",
    transcript_path: "/tmp/does-not-matter.jsonl",
    cwd: "/work/project",
    hook_event_name: "Stop",
    stop_hook_active: false,
    ...extra,
  };
}

function observes(daemon: Daemon): Received[] {
  return daemon.received.filter((r) => r.path === "/agentmemory/observe");
}

function sessionEnds(daemon: Daemon): Received[] {
  return daemon.received.filter((r) => r.path === "/agentmemory/session/end");
}

function storedReplies(daemon: Daemon): CompressedObservation[] {
  const rows = [...(daemon.kv.store.get(KV.observations(SESSION))?.values() ?? [])] as CompressedObservation[];
  return rows.filter((o) => o.source?.hookType === "stop");
}

function spooled(port: number): Array<{ eventId: string; reason: string; body: Record<string, unknown> }> {
  const file = join(home, "spool", `local-${port}.jsonl`);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf-8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

async function search(daemon: Daemon, query: string): Promise<string> {
  return JSON.stringify(await daemon.call("mem::search", { query }));
}

async function seedSession(daemon: Daemon): Promise<void> {
  await daemon.call("mem::observe", {
    hookType: "prompt_submit",
    sessionId: SESSION,
    project: "project",
    cwd: "/work/project",
    timestamp: new Date().toISOString(),
    data: { prompt: "Why does the parser test flake on Windows?" },
  });
}

describe("packaged Stop hook reply capture", () => {
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "am-stop-reply-"));
    hookPorts.clear();
    vi.stubEnv("AGENTMEMORY_AUTO_COMPRESS", "false");
    vi.stubEnv("AGENTMEMORY_AGENT_SCOPE", "shared");
    vi.stubEnv("AGENTMEMORY_FINALIZE_IDLE_MS", "120000");
  });

  afterEach(async () => {
    await Promise.all(daemons.splice(0).map((d) => d.close()));
    vi.unstubAllEnvs();
    const spool = join(home, "spool");
    const draining = () => [...hookPorts].some((p) => drainInProgress(`http://127.0.0.1:${p}`, spool));
    expect(await waitFor(() => !draining(), 5000)).toBe(true);
    rmSync(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  it("stores a delayed reply before an immediate finalization summarizes the session", async () => {
    vi.stubEnv("AGENTMEMORY_FINALIZE_IDLE_MS", "0");
    const llm = provider();
    const daemon = await startDaemon({ observeDelayMs: 800, llm });
    await seedSession(daemon);
    const reply = "The parser flaked because the tokenizer kept carriage returns; we normalised line endings first.";

    const run = await runHook(daemon.port, stop({ last_assistant_message: reply }));

    expect(run.code).toBe(0);
    const [observe] = observes(daemon);
    const [end] = sessionEnds(daemon);
    expect(observe!.body).toMatchObject({ hookType: "stop", sessionId: SESSION, project: "project", cwd: "/work/project" });
    expect(end!.body).toEqual({ sessionId: SESSION, final: false });
    expect(end!.at).toBeGreaterThanOrEqual(observe!.answeredAt!);
    expect(await waitFor(() => vi.mocked(llm.summarize).mock.calls.length > 0, 5000)).toBe(true);
    expect(JSON.stringify(vi.mocked(llm.summarize).mock.calls)).toContain("we normalised line endings first");
  }, 15_000);

  it("still ends the turn when the capture outlives its bound, and keeps the reply for replay", async () => {
    vi.stubEnv("AGENTMEMORY_FINALIZE_IDLE_MS", "0");
    const daemon = await startDaemon({ hangObserve: true });
    await seedSession(daemon);

    const run = await runHook(daemon.port, stop({ last_assistant_message: "Hung capture reply: retry the flaky parser job." }));

    expect(run.code).toBe(0);
    expect(run.ms).toBeLessThan(EXIT_CAP_MS);
    const [end] = sessionEnds(daemon);
    expect(end!.body).toEqual({ sessionId: SESSION, final: false });
    expect(end!.at - run.startedAt).toBeGreaterThanOrEqual(OBSERVE_TIMEOUT_MS - 100);
    expect(((await daemon.kv.get(KV.sessions, SESSION)) as Session).status).toBe("completed");
    const [record] = spooled(daemon.port);
    expect(record!.reason).toBe("timeout");
    expect(record!.eventId).toBe(observes(daemon)[0]!.body["eventId"]);
    expect(JSON.stringify(record!.body)).toContain("retry the flaky parser job");
  }, 15_000);

  it("replays a reply spooled while the server was down, without its secrets", async () => {
    const port = await freePort();
    const key = "sk-ant-" + "b".repeat(32);
    const reply = `Rotated the staging key ${key} and kept <private>vault-path-canary</private> out of notes. Marker cobaltreply stays searchable.`;

    const offline = await runHook(port, stop({ last_assistant_message: reply }));

    expect(offline.code).toBe(0);
    expect(offline.ms).toBeLessThan(EXIT_CAP_MS);
    const [record] = spooled(port);
    expect(record!.body["hookType"]).toBe("stop");
    expect(JSON.stringify(record)).toContain("cobaltreply");
    expect(JSON.stringify(record)).not.toContain(key);
    expect(JSON.stringify(record)).not.toContain("vault-path-canary");

    const daemon = await startDaemon({ port });
    await runHook(port, stop({ stop_hook_active: true, last_assistant_message: "Back online: every parser test passes." }));

    expect(await waitFor(() => storedReplies(daemon).length === 2, 8000)).toBe(true);
    expect(await waitFor(() => spooled(port).length === 0, 3000)).toBe(true);
    expect(observes(daemon).filter((r) => r.body["eventId"] === record!.eventId)).toHaveLength(1);
    const replayed = storedReplies(daemon).find((o) => o.source?.assistantResponse?.includes("cobaltreply"))!;
    expect(JSON.stringify(replayed)).not.toContain(key);
    expect(JSON.stringify(replayed)).not.toContain("vault-path-canary");
    expect(await search(daemon, "cobaltreply")).toContain(replayed.id);
  }, 15_000);

  it("sends nothing from inside an SDK child session", async () => {
    const daemon = await startDaemon();

    await runHook(daemon.port, stop({ entrypoint: "sdk-ts", last_assistant_message: "Child reply." }));
    await runHook(daemon.port, stop({ last_assistant_message: "Child reply." }), { AGENTMEMORY_SDK_CHILD: "1" });

    expect(daemon.received).toHaveLength(0);
  });

  it("authenticates the capture and the turn end the same way", async () => {
    const daemon = await startDaemon();
    mkdirSync(join(home, ".agentmemory"), { recursive: true });
    writeFileSync(join(home, ".agentmemory", "secret"), "stored-secret-0123456789abcdef\n");
    const reply = { last_assistant_message: "Authenticated reply." };

    await runHook(daemon.port, stop(reply));
    await runHook(daemon.port, stop(reply), { AGENTMEMORY_CREDENTIAL_MODE: "explicit" });
    await runHook(daemon.port, stop(reply), { AGENTMEMORY_SECRET: "env-secret-0123456789abcdef" });

    expect(daemon.received.map((r) => [r.path, r.auth])).toEqual([
      ["/agentmemory/observe", "Bearer stored-secret-0123456789abcdef"],
      ["/agentmemory/session/end", "Bearer stored-secret-0123456789abcdef"],
      ["/agentmemory/observe", undefined],
      ["/agentmemory/session/end", undefined],
      ["/agentmemory/observe", "Bearer env-secret-0123456789abcdef"],
      ["/agentmemory/session/end", "Bearer env-secret-0123456789abcdef"],
    ]);
  });

  it("keeps blank replies out of memory but still ends the turn", async () => {
    const daemon = await startDaemon();

    for (const extra of [{}, { last_assistant_message: "   \n" }, { last_assistant_message: 42 }]) {
      expect((await runHook(daemon.port, stop(extra))).code).toBe(0);
    }

    expect(observes(daemon)).toHaveLength(0);
    expect(sessionEnds(daemon).map((r) => r.body)).toEqual([
      { sessionId: SESSION, final: false },
      { sessionId: SESSION, final: false },
      { sessionId: SESSION, final: false },
    ]);
  });

  it("caps a long reply and keeps both its opening and its conclusion searchable", async () => {
    const daemon = await startDaemon();
    const reply = `Opening: the parser investigation is done. ${"Checked another fixture and its line endings. ".repeat(60)}Conclusion: switch the tokenizer to quasarlex streaming.`;

    await runHook(daemon.port, stop({ last_assistant_message: reply }));
    await runHook(daemon.port, stop({ stop_hook_active: true, last_assistant_message: "z".repeat(10_000) }));

    const capped = observes(daemon)[1]!.body["data"] as { last_assistant_message: string };
    expect(capped.last_assistant_message).toHaveLength(4000);
    const stored = storedReplies(daemon).find((o) => o.source?.assistantResponse === reply)!;
    expect(stored.narrative.length).toBeLessThanOrEqual(400);
    expect(stored.narrative).toContain("Opening: the parser investigation is done.");
    expect(stored.narrative).toContain("switch the tokenizer to quasarlex streaming.");
    expect(await search(daemon, "quasarlex")).toContain(stored.id);
  });

  it("stores every reply when a blocking Stop hook continues the same prompt", async () => {
    const daemon = await startDaemon();
    const reply = "Two parser tests still fail.";

    await runHook(daemon.port, stop({ last_assistant_message: reply }));
    await runHook(daemon.port, stop({ stop_hook_active: true, last_assistant_message: reply }));

    const ids = observes(daemon).map((r) => r.body["eventId"]);
    expect(new Set(ids).size).toBe(2);
    expect(storedReplies(daemon).map((o) => o.source?.assistantResponse)).toEqual([reply, reply]);
    expect(sessionEnds(daemon)).toHaveLength(2);
  });

  it("gives the turn end its own short bound, with or without a reply", async () => {
    const daemon = await startDaemon({ hangSessionEnd: true });

    const silent = await runHook(daemon.port, stop());
    const replied = await runHook(daemon.port, stop({ last_assistant_message: "Stored before the turn end hung." }));

    expect(silent.ms).toBeLessThan(EXIT_CAP_MS - 1000);
    expect(replied.ms).toBeLessThan(EXIT_CAP_MS - 1000);
    expect(storedReplies(daemon)).toHaveLength(1);
  }, 15_000);

  it("does not split a character at either edge of the reply cap", async () => {
    const daemon = await startDaemon();
    const atHead = `${"a".repeat(1999)}\u{1F600}${"b".repeat(2500)}`;
    const atTail = `${"a".repeat(3000)}\u{1F600}${"b".repeat(1998)}`;

    await runHook(daemon.port, stop({ last_assistant_message: atHead }));
    await runHook(daemon.port, stop({ stop_hook_active: true, last_assistant_message: atTail }));

    for (const sent of observes(daemon).map((r) => (r.body["data"] as { last_assistant_message: string }).last_assistant_message)) {
      expect(sent).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
      expect(sent.length).toBeLessThanOrEqual(4000);
      expect(sent.startsWith("a")).toBe(true);
      expect(sent.endsWith("b")).toBe(true);
    }
  });

  it("redacts a private block that the reply cap would cut open", async () => {
    const canary = "cobaltcanary";
    const tail = `${"b".repeat(3000)}Conclusion: ship the vermilionfix patch.`;
    const cases = {
      head: `${"a".repeat(1960)}<private>${canary}${"x".repeat(700)}</private>${tail}`,
      tail: `${"a".repeat(2500)}<private>${"x".repeat(100)}${canary}</private>${"b".repeat(1900)}`,
    };
    const port = await freePort();
    const daemon = await startDaemon();

    for (const reply of Object.values(cases)) {
      await runHook(port, stop({ last_assistant_message: reply }));
      await runHook(daemon.port, stop({ stop_hook_active: true, last_assistant_message: reply }));
    }

    expect(JSON.stringify(spooled(port))).not.toContain(canary);
    expect(observes(daemon)).toHaveLength(2);
    for (const observed of observes(daemon)) {
      const sent = (observed.body["data"] as { last_assistant_message: string }).last_assistant_message;
      expect(sent).not.toContain(canary);
      expect(sent).toContain("[REDACTED]");
    }
    for (const stored of storedReplies(daemon)) {
      expect(JSON.stringify(stored)).not.toContain(canary);
      expect(stored.source?.assistantResponse).toContain("[REDACTED]");
    }
  }, 15_000);

  it("keeps the conclusion of a reply longer than the cap recallable", async () => {
    const daemon = await startDaemon();
    const reply = `Opening: the parser investigation is done. ${"Checked another fixture and its line endings. ".repeat(142)}Conclusion: switch the tokenizer to quasarlex streaming.`;
    expect(reply.length).toBeGreaterThan(6500);

    await runHook(daemon.port, stop({ last_assistant_message: reply }));

    const wire = observes(daemon)[0]!.body["data"] as { last_assistant_message: string; last_assistant_message_bytes?: number };
    expect(wire.last_assistant_message).toHaveLength(4000);
    expect(wire.last_assistant_message_bytes).toBe(reply.length);
    const [stored] = storedReplies(daemon);
    expect(stored!.source?.truncated).toBe(true);
    expect(stored!.source?.originalBytes).toBeGreaterThanOrEqual(reply.length);
    expect(stored!.source?.assistantResponse).toContain("Conclusion: switch the tokenizer to quasarlex streaming.");
    expect(stored!.narrative).toContain("Opening: the parser investigation is done.");
    expect(stored!.narrative).toContain("quasarlex streaming.");
    expect(await search(daemon, "quasarlex")).toContain(stored!.id);
  }, 15_000);

  it("reports a reply that fits the cap as untruncated", async () => {
    const daemon = await startDaemon();

    await runHook(daemon.port, stop({ last_assistant_message: "Short reply, nothing dropped." }));

    const wire = observes(daemon)[0]!.body["data"] as Record<string, unknown>;
    expect(wire["last_assistant_message_bytes"]).toBeUndefined();
    expect(storedReplies(daemon)[0]!.source?.truncated).toBe(false);
  });

  it("makes the reply recallable through synthetic compression", async () => {
    const daemon = await startDaemon();
    const reply = "We decided to use bge-m3 for Spanish embeddings because it handles accents.";

    await runHook(daemon.port, stop({ last_assistant_message: reply }));

    const [stored] = storedReplies(daemon);
    expect(stored!.narrative).toBe(reply);
    expect(stored!.source?.assistantResponse).toBe(reply);
    expect(await search(daemon, "Spanish embeddings accents")).toContain(stored!.id);
  });

  it("makes the reply recallable through LLM compression", async () => {
    vi.stubEnv("AGENTMEMORY_AUTO_COMPRESS", "true");
    const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const llm = provider((prompt) => {
      const reply = escape(prompt.split("Assistant response:\n")[1] ?? "");
      return `<observation><type>decision</type><title>Chose the embedding model</title><facts><fact>${reply}</fact></facts><narrative>${reply}</narrative><concepts><concept>embeddings</concept></concepts><files></files><importance>7</importance></observation>`;
    });
    const daemon = await startDaemon({ llm });
    const reply = "We decided to use bge-m3 for Spanish embeddings because it handles accents.";

    await runHook(daemon.port, stop({ last_assistant_message: reply }));

    expect(await waitFor(() => storedReplies(daemon)[0]?.title === "Chose the embedding model", 3000)).toBe(true);
    expect(vi.mocked(llm.compress).mock.calls[0]![1]).toContain(`Assistant response:\n${reply}`);
    const [stored] = storedReplies(daemon);
    expect(stored!.narrative).toBe(reply);
    expect(stored!.source?.assistantResponse).toBe(reply);
    expect(await search(daemon, "Spanish embeddings accents")).toContain(stored!.id);
  });
});
