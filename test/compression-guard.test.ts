import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildCompressionPrompt } from "../src/prompts/compression.js";
import { registerCompressFunction } from "../src/functions/compress.js";
import type { RawObservation, MemoryProvider } from "../src/types.js";

const mockAddSearch = vi.fn();
const mockVectorIndexAddGuarded = vi.fn().mockResolvedValue(true);

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/functions/search.js", () => ({
  getSearchIndex: () => ({
    add: mockAddSearch,
  }),
  vectorIndexAddGuarded: (...args: unknown[]) => mockVectorIndexAddGuarded(...args),
}));

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    store,
    get: async <T>(scope: string, key: string): Promise<T | null> => {
      return (store.get(scope)?.get(key) as T) ?? null;
    },
    set: async <T>(scope: string, key: string, data: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, data);
      return data;
    },
    delete: async (scope: string, key: string): Promise<void> => {
      store.get(scope)?.delete(key);
    },
    list: async <T>(scope: string): Promise<T[]> => {
      if (!store.has(scope)) return [];
      return Array.from(store.get(scope)!.values()) as T[];
    },
  };
}

function mockSdk() {
  const fns = new Map<string, Function>();
  const triggered: Array<{ id: string; data: unknown }> = [];
  return {
    fns,
    triggered,
    registerFunction: (
      idOrOpts: string | { id: string },
      fn: Function,
    ) => {
      const id = typeof idOrOpts === "string" ? idOrOpts : idOrOpts.id;
      fns.set(id, fn);
    },
    trigger: async (
      idOrInput:
        | string
        | { function_id: string; payload: unknown; action?: unknown },
      data?: unknown,
    ) => {
      const id =
        typeof idOrInput === "string" ? idOrInput : idOrInput.function_id;
      const payload =
        typeof idOrInput === "string" ? data : idOrInput.payload;
      triggered.push({ id, data: payload });
      const fn = fns.get(id);
      if (fn) return fn(payload);
      return null;
    },
  };
}

const VALID_COMPRESS_XML = `<observation>
  <type>file_read</type>
  <title>Read src/foo.ts</title>
  <narrative>Read the file contents for analysis.</narrative>
  <facts>
    <fact>File src/foo.ts exists</fact>
  </facts>
  <concepts>
    <concept>typescript</concept>
  </concepts>
  <files>
    <file>src/foo.ts</file>
  </files>
  <importance>4</importance>
</observation>`;

describe("Prompt Guardrails & Empty Payload Skip (Issue #1270)", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;
  let provider: MemoryProvider;
  let compressFn: Function;

  beforeEach(() => {
    vi.clearAllMocks();
    sdk = mockSdk();
    kv = mockKV();
    provider = {
      name: "test-provider",
      compress: vi.fn().mockResolvedValue(VALID_COMPRESS_XML),
      summarize: vi.fn().mockResolvedValue("summary"),
    };
    registerCompressFunction(sdk as never, kv as never, provider);
    compressFn = sdk.fns.get("mem::compress")!;
  });

  describe("buildCompressionPrompt", () => {
    it("returns null for empty observation / lifecycle hooks without content", () => {
      expect(
        buildCompressionPrompt({
          hookType: "session_status",
          timestamp: "2026-08-30T00:00:00.000Z",
        }),
      ).toBeNull();

      expect(
        buildCompressionPrompt({
          hookType: "step_finish",
          timestamp: "2026-08-30T00:00:00.000Z",
          toolInput: {},
          toolOutput: "",
          userPrompt: "   ",
        }),
      ).toBeNull();
    });

    it("formats valid tool observation prompt", () => {
      const prompt = buildCompressionPrompt({
        hookType: "post_tool_use",
        toolName: "Read",
        toolInput: { file_path: "src/index.ts" },
        toolOutput: "export const foo = 1;",
        timestamp: "2026-08-30T00:00:00.000Z",
      });

      expect(prompt).not.toBeNull();
      expect(prompt).toContain("Hook: post_tool_use");
      expect(prompt).toContain("Tool: Read");
      expect(prompt).toContain("src/index.ts");
      expect(prompt).toContain("export const foo = 1;");
    });

    it("formats user prompt and content when present", () => {
      const promptFromUser = buildCompressionPrompt({
        hookType: "prompt_submit",
        userPrompt: "Refactor auth middleware",
        timestamp: "2026-08-30T00:00:00.000Z",
      });
      expect(promptFromUser).not.toBeNull();
      expect(promptFromUser).toContain("User prompt:\nRefactor auth middleware");

      const promptFromContent = buildCompressionPrompt({
        hookType: "custom",
        content: "Important architectural note",
        timestamp: "2026-08-30T00:00:00.000Z",
      });
      expect(promptFromContent).not.toBeNull();
      expect(promptFromContent).toContain("Content:\nImportant architectural note");
    });
  });

  describe("mem::compress LLM bypass and lossless indexing", () => {
    it("Test 1: Empty observation / lifecycle hook returns null prompt and does NOT call LLM provider", async () => {
      const raw: RawObservation = {
        id: "obs_empty",
        sessionId: "ses_1",
        timestamp: new Date().toISOString(),
        hookType: "session_status" as never,
        raw: {},
      };

      const result = await compressFn({
        observationId: raw.id,
        sessionId: raw.sessionId,
        raw,
      });

      expect(result.success).toBe(true);
      expect(result.skipped_llm).toBe(true);
      expect(result.observation).toBeDefined();
      expect(provider.compress).not.toHaveBeenCalled();

      const stored = await kv.get("mem:obs:ses_1", raw.id);
      expect(stored).toBeDefined();
    });

    it("Test 2: Valid tool observation produces valid prompt and calls LLM provider", async () => {
      const raw: RawObservation = {
        id: "obs_tool",
        sessionId: "ses_1",
        timestamp: new Date().toISOString(),
        hookType: "post_tool_use",
        toolName: "Read",
        toolInput: { file_path: "src/foo.ts" },
        toolOutput: "file contents",
        raw: {},
      };

      const result = await compressFn({
        observationId: raw.id,
        sessionId: raw.sessionId,
        raw,
      });

      expect(result.success).toBe(true);
      expect(result.skipped_llm).toBeUndefined();
      expect(provider.compress).toHaveBeenCalledTimes(1);
      expect(result.compressed.title).toBe("Read src/foo.ts");
    });

    it("Test 3: User prompt or content without tool produces valid prompt and calls LLM provider", async () => {
      const rawPrompt: RawObservation = {
        id: "obs_prompt",
        sessionId: "ses_1",
        timestamp: new Date().toISOString(),
        hookType: "prompt_submit",
        userPrompt: "Optimize database queries",
        raw: {},
      };

      const resultPrompt = await compressFn({
        observationId: rawPrompt.id,
        sessionId: rawPrompt.sessionId,
        raw: rawPrompt,
      });

      expect(resultPrompt.success).toBe(true);
      expect(provider.compress).toHaveBeenCalledTimes(1);

      const rawContent: RawObservation = {
        id: "obs_content",
        sessionId: "ses_1",
        timestamp: new Date().toISOString(),
        hookType: "conversation" as never,
        content: "Custom system log message",
        raw: {},
      };

      const resultContent = await compressFn({
        observationId: rawContent.id,
        sessionId: rawContent.sessionId,
        raw: rawContent,
      });

      expect(resultContent.success).toBe(true);
      expect(provider.compress).toHaveBeenCalledTimes(2);
    });

    it("Test 4: Search index and vector index are updated even when LLM is bypassed (lossless guarantee)", async () => {
      const raw: RawObservation = {
        id: "obs_lossless",
        sessionId: "ses_lossless",
        timestamp: new Date().toISOString(),
        hookType: "step_finish" as never,
        raw: {},
      };

      const result = await compressFn({
        observationId: raw.id,
        sessionId: raw.sessionId,
        raw,
      });

      expect(result.success).toBe(true);
      expect(result.skipped_llm).toBe(true);
      expect(result.observation).toBeDefined();

      expect(mockAddSearch).toHaveBeenCalledWith(result.observation);
      expect(mockVectorIndexAddGuarded).toHaveBeenCalledWith(
        result.observation.id,
        result.observation.sessionId,
        expect.stringContaining(result.observation.title),
        { kind: "synthetic", logId: result.observation.id },
      );
    });
  });
});
