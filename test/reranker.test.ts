import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HybridSearchResult } from "../src/types.js";

const transformers = await vi.importActual<typeof import("@huggingface/transformers")>("@huggingface/transformers").catch(() => null);

function result(id: string, combinedScore = 0.5, narrative = ""): HybridSearchResult {
  return {
    observation: { id, title: id, narrative, sessionId: "session", timestamp: "2026-01-01T00:00:00Z", type: "other", facts: [], concepts: [], files: [], importance: 5 },
    bm25Score: 0.3, vectorScore: 0.4, graphScore: 0, combinedScore, sessionId: "session",
  };
}

class Tensor {
  constructor(public type: string, public data: ArrayLike<number | bigint>, public dims: number[]) {}
}

function fixture() {
  const tokenizer = vi.fn((query: string, options: { text_pair: string }) => {
    const ids = (text: string) => text.trim() ? text.trim().split(/\s+/).map((token) => ({ relevant: 5, irrelevant: 6, query: 7, "[CLS]": 1, "[SEP]": 2 }[token] ?? 8)) : [];
    const queryIds = ids(query), documentIds = ids(options.text_pair);
    const input_ids = [1, ...queryIds, 2, ...documentIds, 2];
    return { input_ids, attention_mask: input_ids.map(() => 1), token_type_ids: [...Array(queryIds.length + 2).fill(0), ...Array(documentIds.length + 1).fill(1)] };
  });
  const model = vi.fn(async (inputs: Record<string, Tensor>) => {
    const ids = Array.from(inputs.input_ids.data, Number);
    const types = Array.from(inputs.token_type_ids.data, Number);
    const document = ids.filter((_, i) => types[i] === 1);
    return { logits: new Tensor("float32", [document.includes(5) ? 8 : -9], [1, 1]) };
  });
  const loadTokenizer = vi.fn(async () => tokenizer);
  const loadModel = vi.fn(async () => model);
  vi.doMock("@huggingface/transformers", () => ({
    AutoTokenizer: { from_pretrained: loadTokenizer },
    AutoModelForSequenceClassification: { from_pretrained: loadModel },
    Tensor,
  }));
  return { tokenizer, model, loadTokenizer, loadModel };
}

beforeEach(() => vi.resetModules());
afterEach(() => { vi.doUnmock("@huggingface/transformers"); vi.useRealTimers(); });

describe("cross-encoder reranker", () => {
  it("falls back when the optional dependency is unavailable", async () => {
    vi.doMock("@huggingface/transformers", () => { throw new Error("not installed"); });
    const { rerank, isRerankerAvailable } = await import("../src/state/reranker.js");
    const input = [result("irrelevant"), result("relevant")];
    expect(await rerank("query", input)).toBe(input);
    expect(isRerankerAvailable()).toBe(false);
  });

  it("does not load for empty/single results, blank queries or unusable windows", async () => {
    const { loadTokenizer } = fixture();
    const { rerank } = await import("../src/state/reranker.js");
    const input = [result("irrelevant"), result("relevant")];
    expect(await rerank("query", [])).toEqual([]);
    expect(await rerank("query", input.slice(0, 1))).toEqual(input.slice(0, 1));
    expect(await rerank(" \n", input)).toBe(input);
    for (const topK of [0, 1, -1, 1.5, NaN, Infinity]) expect(await rerank("query", input, topK)).toBe(input);
    expect(loadTokenizer).not.toHaveBeenCalled();
  });

  it("ranks raw single logits without replacing hybrid scores or mutating inputs", async () => {
    const { loadModel, tokenizer } = fixture();
    const { rerank, isRerankerAvailable } = await import("../src/state/reranker.js");
    const input = [result("irrelevant", 0.99), result("relevant", 0.1)];
    const before = structuredClone(input);
    const output = await rerank("query", input);
    expect(output.map((item) => [item.observation.id, item.rerankScore, item.combinedScore, item.rerankPosition]))
      .toEqual([["relevant", 8, 0.1, 1], ["irrelevant", -9, 0.99, 2]]);
    expect(input).toEqual(before);
    expect(loadModel).toHaveBeenCalledWith("Xenova/ms-marco-MiniLM-L-6-v2", { dtype: "q8" });
    expect(tokenizer).toHaveBeenCalledWith("query", { text_pair: "relevant", return_tensor: false, return_token_type_ids: true });
    expect(isRerankerAvailable()).toBe(true);
  });

  it("keeps every tail candidate in its original order", async () => {
    const { model } = fixture();
    const { rerank } = await import("../src/state/reranker.js");
    const input = [result("irrelevant"), result("relevant"), result("tail-a"), result("tail-b")];
    const output = await rerank("query", input, 2);
    expect(output.map((item) => item.observation.id)).toEqual(["relevant", "irrelevant", "tail-a", "tail-b"]);
    expect(output.slice(2)).toEqual(input.slice(2));
    expect(output[2]).toBe(input[2]);
    expect(model).toHaveBeenCalledTimes(2);
  });

  it("preserves ties and supports a window larger than the result set", async () => {
    fixture();
    const { rerank } = await import("../src/state/reranker.js");
    const input = [result("second", 0.1), result("first", 0.99)];
    expect((await rerank("query", input, 100)).map((item) => item.observation.id)).toEqual(["second", "first"]);
  });

  it("falls back as a whole on partial failure and recovers on the next request", async () => {
    const { model } = fixture();
    model.mockResolvedValueOnce({ logits: new Tensor("float32", [9], [1, 1]) }).mockRejectedValueOnce(new Error("inference failed"));
    const { rerank } = await import("../src/state/reranker.js");
    const input = [result("irrelevant"), result("relevant"), result("tail")];
    expect(await rerank("query", input, 2)).toBe(input);
    expect((await rerank("query", input, 2))[0].observation.id).toBe("relevant");
  });

  it.each([
    { logits: new Tensor("float32", [NaN], [1, 1]) },
    { logits: new Tensor("float32", [Infinity], [1, 1]) },
    { logits: new Tensor("float32", [-Infinity], [1, 1]) },
    { logits: new Tensor("float32", [], [1, 1]) },
    { logits: new Tensor("float32", [1, 2], [1, 2]) },
    { logits: new Tensor("float32", [1], [1]) },
    { logits: null },
    {},
  ])("rejects invalid model output without dropping candidates (%#)", async (output) => {
    const { model } = fixture();
    model.mockResolvedValue(output as never);
    const { rerank } = await import("../src/state/reranker.js");
    const input = [result("irrelevant"), result("relevant"), result("tail")];
    expect(await rerank("query", input, 2)).toBe(input);
  });

  it("shares model loading across concurrent queries without sharing their tokens", async () => {
    const { loadModel, tokenizer } = fixture();
    const { rerank } = await import("../src/state/reranker.js");
    const input = [result("irrelevant"), result("relevant")];
    const outputs = await Promise.all([rerank("query one", input), rerank("query two", input)]);
    expect(loadModel).toHaveBeenCalledTimes(1);
    expect(outputs.map((items) => items[0].observation.id)).toEqual(["relevant", "relevant"]);
    expect(new Set(tokenizer.mock.calls.map(([query]) => query))).toEqual(new Set(["query one", "query two"]));
  });

  it.each(["loadTokenizer", "loadModel"] as const)("retries %s after a cooldown while coalescing concurrent retries", async (stage) => {
    vi.useFakeTimers();
    const loaders = fixture();
    const failedLoad = loaders[stage];
    failedLoad.mockRejectedValueOnce(new Error("download unavailable"));
    const { rerank, isRerankerAvailable } = await import("../src/state/reranker.js");
    const input = [result("irrelevant"), result("relevant")];
    expect(await Promise.all([rerank("query", input), rerank("query", input)])).toEqual([input, input]);
    expect(await rerank("query", input)).toBe(input);
    expect(failedLoad).toHaveBeenCalledTimes(1);
    expect(isRerankerAvailable()).toBe(false);
    vi.advanceTimersByTime(60_000);
    const outputs = await Promise.all([rerank("query", input), rerank("query", input)]);
    expect(failedLoad).toHaveBeenCalledTimes(2);
    expect(outputs[0][0].observation.id).toBe("relevant");
  });

  it("isolates an inference failure from a concurrent query", async () => {
    const { model } = fixture();
    model.mockRejectedValueOnce(new Error("one request failed"));
    const { rerank } = await import("../src/state/reranker.js");
    const input = [result("irrelevant"), result("relevant")];
    const outputs = await Promise.all([rerank("query one", input), rerank("query two", input)]);
    expect(outputs[0]).toBe(input);
    expect(outputs[1][0].observation.id).toBe("relevant");
  });

  it("retains both segments and separators for long queries and documents", async () => {
    const { model } = fixture();
    const { rerank } = await import("../src/state/reranker.js");
    await rerank("query ".repeat(700), [result("relevant", 0.1, "word ".repeat(700)), result("irrelevant")]);
    for (const [inputs] of model.mock.calls) {
      const ids = Array.from(inputs.input_ids.data, Number), types = Array.from(inputs.token_type_ids.data, Number);
      expect(ids).toHaveLength(512);
      expect(ids[0]).toBe(1);
      expect(ids.at(-1)).toBe(2);
      const boundary = types.indexOf(1);
      expect(boundary).toBeGreaterThan(1);
      expect(ids[boundary - 1]).toBe(2);
      expect(ids[boundary]).toBe(inputs === model.mock.calls[0][0] ? 5 : 6);
      expect(inputs.attention_mask.dims).toEqual(inputs.input_ids.dims);
    }
  });

  it("keeps literal special tokens in the correct segment and handles empty documents", async () => {
    const { model } = fixture();
    const { rerank } = await import("../src/state/reranker.js");
    await rerank("[SEP] query [CLS]", [result("relevant", 0.5, "[CLS] [SEP]"), result("")]);
    const first = model.mock.calls[0][0];
    expect(Array.from(first.input_ids.data, Number)).toEqual([1, 2, 7, 1, 2, 5, 1, 2, 2]);
    expect(Array.from(first.token_type_ids.data, Number)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1]);
    expect(Array.from(model.mock.calls[1][0].input_ids.data, Number)).toEqual([1, 2, 7, 1, 2, 2]);
  });

  it("passes evidence beyond 512 characters to tokenization", async () => {
    const { tokenizer } = fixture();
    const { rerank } = await import("../src/state/reranker.js");
    const narrative = "context ".repeat(100) + "relevant";
    expect((await rerank("query", [result("irrelevant"), result("", 0.5, narrative)]))[0].observation.narrative).toBe(narrative);
    expect(tokenizer.mock.calls[1][1].text_pair).toBe(narrative);
  });
});

it.skipIf(!transformers)("uses the real paired tokenizer and bypasses single-logit classification softmax", async () => {
  const actual = transformers!;
  const vocab = { "[PAD]": 0, "[UNK]": 1, "[CLS]": 2, "[SEP]": 3, "[MASK]": 4, query: 5, relevant: 6, irrelevant: 7 };
  const tokenizer = new actual.BertTokenizer({
    added_tokens: Object.entries(vocab).slice(0, 5).map(([content, id]) => ({ content, id, special: true, normalized: false, single_word: false, lstrip: false, rstrip: false })),
    normalizer: { type: "BertNormalizer", lowercase: true, strip_accents: true, handle_chinese_chars: true, clean_text: true },
    pre_tokenizer: { type: "BertPreTokenizer" },
    post_processor: { type: "BertProcessing", sep: ["[SEP]", 3], cls: ["[CLS]", 2] },
    decoder: { type: "WordPiece", prefix: "##", cleanup: true },
    model: { type: "WordPiece", vocab, unk_token: "[UNK]", continuing_subword_prefix: "##", max_input_chars_per_word: 100 },
  }, { model_max_length: 512, cls_token: "[CLS]", sep_token: "[SEP]", pad_token: "[PAD]", unk_token: "[UNK]", mask_token: "[MASK]" });
  const nativeModel = Object.assign(vi.fn(async (inputs: Record<string, InstanceType<typeof actual.Tensor>>) => ({
    logits: new actual.Tensor("float32", new Float32Array([Array.from(inputs.input_ids.data, Number).includes(6) ? 8 : -9]), [1, 1]),
  })), { config: { id2label: { 0: "LABEL_0" } } });
  const classifier = new actual.TextClassificationPipeline({ task: "text-classification", tokenizer, model: nativeModel as never });
  expect((await Promise.all([classifier("query [SEP] relevant"), classifier("query [SEP] irrelevant")])).map((items) => items[0].score)).toEqual([1, 1]);
  vi.doMock("@huggingface/transformers", () => ({
    AutoTokenizer: { from_pretrained: async () => tokenizer },
    AutoModelForSequenceClassification: { from_pretrained: async () => nativeModel },
    Tensor: actual.Tensor,
    pipeline: async () => classifier,
  }));
  const { rerank } = await import("../src/state/reranker.js");
  const output = await rerank("query", [result("irrelevant"), result("relevant")]);
  expect(output.map((item) => item.rerankScore)).toEqual([8, -9]);
  expect(output[0].observation.id).toBe("relevant");
  nativeModel.mockClear();
  await rerank("[SEP] [CLS] " + "query ".repeat(700), [result("relevant", 0.5, "[SEP] [CLS] " + "query ".repeat(700)), result("")]);
  for (const [inputs] of nativeModel.mock.calls) {
    const ids = Array.from(inputs.input_ids.data, Number), types = Array.from(inputs.token_type_ids.data, Number);
    expect(ids).toHaveLength(512);
    expect(ids.slice(0, 3)).toEqual([2, 3, 2]);
    expect(ids.at(-1)).toBe(3);
    const boundary = types.indexOf(1);
    expect(boundary).toBeGreaterThan(2);
    expect(ids[boundary - 1]).toBe(3);
  }
  expect(Array.from(nativeModel.mock.calls[0][0].input_ids.data, Number).slice(257, 260)).toEqual([6, 3, 2]);
});
