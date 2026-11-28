#!/usr/bin/env node
/**
 * Repro: the default local embedding model is English-only, so CJK text
 * tokenizes to [UNK] and unrelated records collapse to near-identical vectors.
 *
 *   node scripts/repro-cjk-embedding.mjs                 # default model
 *   node scripts/repro-cjk-embedding.mjs Xenova/bge-small-zh-v1.5
 *
 * Requires @huggingface/transformers (already a dependency for local embeddings).
 */
import { AutoTokenizer, pipeline } from "@huggingface/transformers";

const model = process.argv[2] || "Xenova/all-MiniLM-L6-v2";

const sentences = [
  "量化交易策略",
  "记忆系统索引",
  "回测框架",
  "今天天气很好",
];

const tokenizer = await AutoTokenizer.from_pretrained(model);

console.log(`model: ${model}\n`);
for (const text of sentences) {
  const ids = (await tokenizer(text)).input_ids.tolist()[0];
  const unkCount = ids.filter(
    (id) => tokenizer.decode([id], { skip_special_tokens: false }) === "[UNK]",
  ).length;
  const unkRatio = unkCount / ids.length;
  console.log(`${text.padEnd(10)} tokens=${ids.length} [UNK]=${(unkRatio * 100).toFixed(0)}%`);
}

const extractor = await pipeline("feature-extraction", model, { dtype: "q8" });
const vectors = [];
for (const text of sentences) {
  const out = await extractor([text], { pooling: "mean", normalize: true });
  vectors.push(out.tolist()[0]);
}

const cosine = (a, b) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / Math.sqrt(na * nb);
};

console.log("\npairwise cosine (unrelated topics should be low):");
for (let i = 0; i < vectors.length; i++) {
  for (let j = i + 1; j < vectors.length; j++) {
    console.log(
      `  ${sentences[i]} <-> ${sentences[j]}: ${cosine(vectors[i], vectors[j]).toFixed(3)}`,
    );
  }
}
