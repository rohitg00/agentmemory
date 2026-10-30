import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendSpool, retainSent, type SpoolRecord } from "../src/capture/spool.js";
import { registerObserveFunction } from "../src/functions/observe.js";
import { KV } from "../src/state/schema.js";
import { onLiveEvent } from "../src/viewer/live-events.js";
import type { CompressedObservation, RawObservation } from "../src/types.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const SECRET = "abcdefghijklmnopqrstuvwxyz";
const PRIVATE_TEXT = "private capture details";
const NORMAL = { count: 3, ok: true, empty: null, text: "quoted \"text\" and a \\ path\nnext line" };
class SerializedToolOutput {
  toJSON(key: string) {
    return { key, [`sk-${SECRET}`]: `password=${SECRET}`, ["__proto__"]: { note: `<private>${PRIVATE_TEXT}</private>` } };
  }
}

const CASES = [
  {
    name: "colliding redacted property names",
    data: { nested: [{ [`sk-${SECRET}`]: "first", [`pk-${SECRET}`]: "second", "[REDACTED_SECRET]_2": "ordinary" }] },
    expected: { nested: [{ "[REDACTED_SECRET]": "first", "[REDACTED_SECRET]_3": "second", "[REDACTED_SECRET]_2": "ordinary" }] },
  },
  {
    name: "nested URL objects and dates",
    data: { tool_name: "Read", tool_input: [{ url: new URL(`https://user:${SECRET}@example.test/path`) }], tool_output: new Date("2026-10-16T00:00:00.000Z") },
    expected: { tool_name: "Read", tool_input: [{ url: "https://[REDACTED_SECRET]@example.test/path" }], tool_output: "2026-10-16T00:00:00.000Z" },
  },
  {
    name: "custom JSON representations and boxed strings",
    data: { tool_name: "Read", tool_input: new String(`api_key=${SECRET}`), tool_output: new SerializedToolOutput() },
    expected: { tool_name: "Read", tool_input: "[REDACTED_SECRET]", tool_output: { key: "tool_output", "[REDACTED_SECRET]": "[REDACTED_SECRET]", ["__proto__"]: { note: "[REDACTED]" } } },
  },
  {
    name: "plain objects with custom JSON representations",
    data: { toJSON() { return { tool_name: "Read", tool_output: `api_key=${SECRET}` }; } },
    expected: { tool_name: "Read", tool_output: "[REDACTED_SECRET]" },
  },
  {
    name: "undefined payloads",
    data: undefined,
    expected: undefined,
  },
  {
    name: "a secret assignment at the end of a string",
    data: { tool_name: "Bash", tool_input: { command: "printenv" }, tool_output: `api_key=${SECRET}` },
    expected: { tool_name: "Bash", tool_input: { command: "printenv" }, tool_output: "[REDACTED_SECRET]" },
  },
  {
    name: "quoted secrets and private blocks in nested objects and arrays",
    data: {
      tool_name: "Bash",
      tool_input: { command: `password="${SECRET}"`, options: NORMAL },
      tool_output: [
        { message: `before <private>${PRIVATE_TEXT}\n\"quoted\"</private> after` },
        [`token='${SECRET}'`, "ordinary result", 7, false, null],
      ],
    },
    expected: {
      tool_name: "Bash",
      tool_input: { command: "[REDACTED_SECRET]", options: NORMAL },
      tool_output: [
        { message: "before [REDACTED] after" },
        ["[REDACTED_SECRET]", "ordinary result", 7, false, null],
      ],
    },
  },
  {
    name: "an array payload",
    data: [`api_key=${SECRET}`, { note: `<private>${PRIVATE_TEXT}</private>`, ...NORMAL }],
    expected: ["[REDACTED_SECRET]", { note: "[REDACTED]", ...NORMAL }],
  },
  {
    name: "ordinary JSON data",
    data: { tool_name: "Read", tool_input: { file_path: "src/main.ts" }, tool_output: NORMAL },
    expected: { tool_name: "Read", tool_input: { file_path: "src/main.ts" }, tool_output: NORMAL },
  },
  {
    name: "secrets in nested object property names",
    data: {
      [`sk-${SECRET}`]: "label",
      tool_name: "Read",
      tool_input: [{ [`<private>${PRIVATE_TEXT}</private>`]: { [`api_key=${SECRET}`]: NORMAL } }],
      tool_output: "ordinary result",
    },
    expected: {
      "[REDACTED_SECRET]": "label",
      tool_name: "Read",
      tool_input: [{ "[REDACTED]": { "[REDACTED_SECRET]": NORMAL } }],
      tool_output: "ordinary result",
    },
  },
  {
    name: "an own __proto__ JSON field",
    data: { tool_name: "Read", tool_input: { ["__proto__"]: { note: `api_key=${SECRET}` } }, tool_output: NORMAL },
    expected: { tool_name: "Read", tool_input: { ["__proto__"]: { note: "[REDACTED_SECRET]" } }, tool_output: NORMAL },
  },
];

function payload(data: unknown) {
  return {
    hookType: "post_tool_use" as const,
    sessionId: "ses_capture_redaction",
    project: "redaction-test",
    cwd: "/work/redaction-test",
    timestamp: "2026-10-16T00:00:00.000Z",
    data,
  };
}

function expectClean(value: unknown): void {
  const text = JSON.stringify(value);
  expect(text).not.toContain(SECRET);
  expect(text).not.toContain(PRIVATE_TEXT);
}

describe.each(["pending", "retained"] as const)("%s capture spool redaction", (mode) => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "am-capture-redaction-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it.each(CASES)("preserves structure while scrubbing $name", ({ data, expected }) => {
    const body = payload(data);
    const before = JSON.stringify(body);
    const url = "http://localhost:4811";
    const eventId = "evc_redaction000001";
    if (mode === "pending") {
      expect(appendSpool(url, eventId, body, "unreachable", { dir }).spooled).toBe(true);
    } else {
      expect(retainSent(url, eventId, body, { bootId: "redactionboot001", durableAfterMs: 60_000 }, { dir })).toBe(true);
    }
    const files = readdirSync(dir).filter((file) => file.endsWith(".jsonl"));
    expect(files).toHaveLength(1);
    const text = readFileSync(join(dir, files[0]!), "utf-8");
    expectClean(text);
    const record = JSON.parse(text.trim()) as SpoolRecord;
    expect(record.body).toEqual(JSON.parse(JSON.stringify({ ...payload(expected) })));
    expect(record.eventId).toBe(eventId);
    expect(JSON.stringify(body)).toBe(before);
  });
});

describe("direct observation redaction", () => {
  beforeEach(() => {
    vi.stubEnv("AGENTMEMORY_AUTO_COMPRESS", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(CASES)("preserves structure while scrubbing $name", async ({ data, expected }) => {
    const sdk = mockSdk({ looseTrigger: true });
    const kv = mockKV();
    const events: unknown[] = [];
    const unsubscribe = onLiveEvent((event) => events.push(event));
    const compress = vi.fn(async (_data: unknown) => null);
    sdk.registerFunction("mem::compress", compress);
    registerObserveFunction(sdk as never, kv as never);
    const input = payload(data);
    const before = JSON.stringify(input);

    const result = await sdk.trigger({ function_id: "mem::observe", payload: input }) as { observationId: string };

    expect(result.observationId).toBeTruthy();
    const stored = await kv.get<CompressedObservation>(KV.observations(input.sessionId), result.observationId);
    unsubscribe();
    const streamed = (events.find((event) => (event as { type: string }).type === "raw_observation") as { data: { observation: RawObservation } }).data.observation;
    expect(streamed.raw).toEqual(expected);
    expect(stored?.source?.toolName).toBe(streamed.toolName);
    expect(stored?.source?.toolInput).toEqual(streamed.toolInput);
    expect(stored?.source?.toolOutput).toEqual(streamed.toolOutput);
    if (!streamed.toolName) expect(stored?.source?.payload).toEqual(expected);
    expectClean(stored);
    expectClean(streamed);
    expect(compress).toHaveBeenCalledWith({ observationId: result.observationId, sessionId: input.sessionId });
    expect(JSON.stringify(input)).toBe(before);
  });
});
