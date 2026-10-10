import { LONGMEMEVAL, REPO_URL } from "./site";

export type K = 5 | 10;

export interface TypeHits {
  type: string;
  count: number;
  hits: Record<K, number>;
}

export const TYPE_HITS: TypeHits[] = LONGMEMEVAL.byType.map((t) => ({
  type: t.type,
  count: t.count,
  hits: { 5: t.h5, 10: t.h10 },
}));

export function totalHits(k: K): number {
  return TYPE_HITS.reduce((sum, t) => sum + t.hits[k], 0);
}

export const benchSrc = {
  readme: `${REPO_URL}/blob/main/benchmark/README.md`,
  budgets: `${REPO_URL}/blob/main/benchmark/capture-costs-budgets.json`,
  costsFigure: `${REPO_URL}/blob/main/docs/benchmarks/capture-costs.svg`,
  longmemevalScript: `${REPO_URL}/blob/main/benchmark/longmemeval-bench.ts`,
  realEmbeddingsScript: `${REPO_URL}/blob/main/benchmark/real-embeddings-eval.ts`,
};

export const REPRODUCE = {
  download: `pip install huggingface_hub
python3 -c "
from huggingface_hub import hf_hub_download
hf_hub_download(repo_id='xiaowu0162/longmemeval-cleaned', filename='longmemeval_s_cleaned.json', repo_type='dataset', local_dir='benchmark/data')
"`,
  bm25: "npx tsx benchmark/longmemeval-bench.ts bm25",
  hybrid: "npx tsx benchmark/longmemeval-bench.ts hybrid",
  costs: "npm run build && npm run bench:capture-costs",
};

export const TOKEN_SETUP = {
  observations: 240,
  sessions: 30,
  queries: 20,
  model: "Xenova/all-MiniLM-L6-v2 (384d, local)",
};

export interface BudgetRow {
  profile: string;
  n: number;
  hookP95Ms: number;
  recoveryIndexReadyMs: number;
  diskPerObsBytes: number;
  idleRssKiB: number;
  searchTokensP50: number;
}

export const BUDGETS: BudgetRow[] = [
  { profile: "keyless", n: 1000, hookP95Ms: 268, recoveryIndexReadyMs: 3126, diskPerObsBytes: 4510, idleRssKiB: 340760, searchTokensP50: 681 },
  { profile: "keyless", n: 10000, hookP95Ms: 257, recoveryIndexReadyMs: 5742, diskPerObsBytes: 4036, idleRssKiB: 644300, searchTokensP50: 690 },
  { profile: "embed", n: 1000, hookP95Ms: 466, recoveryIndexReadyMs: 5914, diskPerObsBytes: 9552, idleRssKiB: 381080, searchTokensP50: 663 },
  { profile: "embed", n: 10000, hookP95Ms: 406, recoveryIndexReadyMs: 6346, diskPerObsBytes: 9062, idleRssKiB: 863880, searchTokensP50: 678 },
];

export const RECOVERY_FACTS = [
  { value: "10,000 of 10,000", label: "memories and vectors back after SIGKILL, with 0 embedding calls" },
  { value: "1,000 of 1,000", label: "tool calls kept while the service was down" },
];
