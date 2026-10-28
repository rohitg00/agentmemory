import evaluation from "./generated-evaluation.json";

export const EVALUATION = evaluation;
export type Adapter = "agentmemory-bm25-component" | "grep";
export const ADAPTERS: Adapter[] = ["agentmemory-bm25-component", "grep"];
export const ADAPTER_LABELS: Record<Adapter, string> = {
  "agentmemory-bm25-component": "BM25 component",
  grep: "grep baseline",
};
export const TYPE_HITS = Object.entries(evaluation.longmemeval.byType).map(([type, values]) => ({
  type,
  count: values.grep.scored,
  hits: Object.fromEntries(ADAPTERS.map((key) => [key, Math.round(values[key].recallAll * values[key].scored)])) as Record<Adapter, number>,
}));
export function totalHits(adapter: Adapter): number {
  return TYPE_HITS.reduce((sum, row) => sum + row.hits[adapter], 0);
}
export function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
export const REPRODUCE = {
  download: "mkdir -p benchmark/data\ncurl -fL https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/98d7416c24c778c2fee6e6f3006e7a073259d48f/longmemeval_s_cleaned.json -o benchmark/data/longmemeval_s_cleaned.json\nshasum -a 256 benchmark/data/longmemeval_s_cleaned.json",
  retrieval: "npm run eval:longmemeval -- --data benchmark/data/longmemeval_s_cleaned.json --adapters grep,bm25",
  coding: "npm run eval:coding-life -- --adapters grep,bm25",
};
