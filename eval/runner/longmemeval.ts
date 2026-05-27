import { existsSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { agentmemoryAdapter } from "./adapters/agentmemory.js";
import { grepAdapter } from "./adapters/grep.js";
import { vectorAdapter } from "./adapters/vector.js";
import { loadLongMemEval, stratifySample } from "./load.js";
import { aggregate, scoreQuestion } from "./score.js";
import type { Adapter, ScoreRow } from "./types.js";

const ADAPTERS: Record<string, Adapter> = {
  grep: grepAdapter as unknown as Adapter,
  vector: vectorAdapter as unknown as Adapter,
  agentmemory: agentmemoryAdapter as unknown as Adapter,
};

interface CliOptions {
  data: string;
  adapters: string;
  k: string;
  limit?: string;
  stratify?: string;
  out: string;
}

function parse(): CliOptions {
  const { values } = parseArgs({
    options: {
      data: { type: "string", default: process.env.LONGMEMEVAL_PATH ?? "" },
      adapters: { type: "string", default: "grep,vector,agentmemory" },
      k: { type: "string", default: "5" },
      limit: { type: "string" },
      stratify: { type: "string" },
      out: { type: "string", default: "eval/reports/longmemeval" },
    },
  });
  return values as unknown as CliOptions;
}

async function main(): Promise<void> {
  const opts = parse();
  if (!opts.data) {
    console.error("--data <path/to/longmemeval_s.json> required (or LONGMEMEVAL_PATH env)");
    process.exit(2);
  }
  const k = Number(opts.k);
  if (!Number.isInteger(k) || k <= 0) {
    console.error(`--k must be a positive integer, got: ${opts.k}`);
    process.exit(2);
  }
  let limit: number | undefined;
  if (opts.limit !== undefined) {
    limit = Number(opts.limit);
    if (!Number.isInteger(limit) || limit <= 0) {
      console.error(`--limit must be a positive integer, got: ${opts.limit}`);
      process.exit(2);
    }
  }
  let perType: number | undefined;
  if (opts.stratify !== undefined) {
    perType = Number(opts.stratify);
    if (!Number.isInteger(perType) || perType <= 0) {
      console.error(`--stratify must be a positive integer, got: ${opts.stratify}`);
      process.exit(2);
    }
  }
  const adapterNames = opts.adapters.split(",").map((s) => s.trim()).filter(Boolean);
  for (const a of adapterNames) {
    if (!ADAPTERS[a]) {
      console.error(`unknown adapter: ${a}. options: ${Object.keys(ADAPTERS).join(",")}`);
      process.exit(2);
    }
  }
  let questions = loadLongMemEval(resolve(opts.data), limit);
  if (perType) questions = stratifySample(questions, perType);
  console.log(
    `loaded ${questions.length} questions, adapters: ${adapterNames.join(",")}, k=${k}`,
  );

  const outDir = resolve(opts.out);
  mkdirSync(outDir, { recursive: true });
  const ndjsonPath = `${outDir}/scores.ndjson`;
  if (existsSync(ndjsonPath)) writeFileSync(ndjsonPath, "");
  mkdirSync(dirname(ndjsonPath), { recursive: true });

  const rows: ScoreRow[] = [];
  for (const adapterName of adapterNames) {
    const adapter = ADAPTERS[adapterName];
    console.log(`\n== ${adapter.name} ==`);
    for (const q of questions) {
      const t0 = performance.now();
      const state = await adapter.init(q.haystack);
      try {
        const ranked = await adapter.query(q.question, state, k);
        const latencyMs = performance.now() - t0;
        const row = scoreQuestion(q, ranked, k, adapter.name, latencyMs);
        rows.push(row);
        appendFileSync(ndjsonPath, JSON.stringify(row) + "\n");
        const mark = row.hit ? "+" : "-";
        console.log(
          `  ${mark} ${q.id} [${q.type}] R@${k}=${row.recallAtK.toFixed(2)} (${Math.round(latencyMs)}ms)`,
        );
      } finally {
        if (adapter.teardown) await adapter.teardown(state);
      }
    }
  }

  const agg = aggregate(rows);
  const summaryPath = `${outDir}/summary.json`;
  writeFileSync(summaryPath, JSON.stringify(agg, null, 2));

  console.log("\n=== Summary ===");
  for (const [adapter, stats] of Object.entries(agg.byAdapter)) {
    console.log(
      `  ${adapter.padEnd(22)} P@${k}=${stats.p.toFixed(3)} R@${k}=${stats.r.toFixed(3)} hit=${stats.hit}/${stats.n} p50=${Math.round(stats.latencyP50)}ms`,
    );
  }
  console.log(`\nwrote ${ndjsonPath}`);
  console.log(`wrote ${summaryPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
