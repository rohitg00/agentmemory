import { parseArgs } from "node:util";
import { agentmemoryAdapter } from "./adapters/agentmemory.js";
import { bm25Adapter } from "./adapters/bm25.js";
import { grepAdapter } from "./adapters/grep.js";
import { vectorAdapter } from "./adapters/vector.js";
import type { Adapter } from "./types.js";

const adapters: Record<string, Adapter<any>> = {
  grep: grepAdapter, bm25: bm25Adapter, vector: vectorAdapter, agentmemory: agentmemoryAdapter,
};

export function parseCli(benchmark: string, defaultData: string) {
  const { values } = parseArgs({ options: {
    data: { type: "string", default: defaultData },
    adapters: { type: "string", default: "grep,bm25" },
    k: { type: "string", default: "5" },
    limit: { type: "string" }, stratify: { type: "string" },
    out: { type: "string", default: "eval/reports/" + benchmark + "-" + new Date().toISOString().replace(/[:.]/g, "-") },
  } });
  const integer = (name: "k" | "limit" | "stratify"): number | undefined => {
    const raw = values[name];
    if (raw === undefined) return undefined;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) throw new Error("--" + name + " must be a positive integer");
    return value;
  };
  const names = values.adapters.split(",").map((s) => s.trim()).filter(Boolean);
  const selected = names.map((name) => {
    if (!adapters[name]) throw new Error("Unknown adapter: " + name);
    return adapters[name];
  });
  return { data: values.data, adapters: selected, k: integer("k")!, limit: integer("limit"),
    stratify: integer("stratify"), outDir: values.out };
}
