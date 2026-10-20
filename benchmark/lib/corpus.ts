export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const NOUNS = [
  "cache", "queue", "router", "stream", "shard", "lock", "buffer", "worker",
  "engine", "trigger", "function", "memory", "index", "graph", "vector",
  "session", "observation", "summary", "embedding", "tokenizer", "scheduler",
  "consumer", "producer", "channel", "actor", "pipeline", "watcher", "pool",
];
export const VERBS = [
  "flushes", "rotates", "compacts", "rebalances", "drains", "warms",
  "expires", "deduplicates", "snapshots", "replays", "promotes", "demotes",
  "merges", "splits", "indexes", "scans", "compresses", "uploads",
];
export const CONCEPTS = [
  "throughput", "latency", "backpressure", "consistency", "isolation",
  "durability", "idempotency", "fan-out", "cardinality", "skew",
  "hot-path", "cold-start", "tail-latency", "saturation", "quiescence",
];

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)]!;
}

export function buildContent(rng: () => number, i: number): string {
  const n = pick(rng, NOUNS);
  const v = pick(rng, VERBS);
  const c1 = pick(rng, CONCEPTS);
  const c2 = pick(rng, CONCEPTS);
  const k = Math.floor(rng() * 9999);
  return `seed-${i} the ${n} ${v} ${c1} under ${c2} pressure (k=${k})`;
}

export interface ToolCapture {
  index: number;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput: string;
  headMarker: string;
  tailMarker: string;
}

const TOOLS = ["Bash", "Read", "Edit", "Grep"] as const;

export function buildToolCapture(
  rng: () => number,
  i: number,
  outputBytes: number,
): ToolCapture {
  const toolName = pick(rng, TOOLS);
  const headMarker = `capmark${i}head`;
  const tailMarker = `capmark${i}tail`;
  const file = `src/${pick(rng, NOUNS)}/${pick(rng, NOUNS)}-${i}.ts`;
  const toolInput: Record<string, unknown> =
    toolName === "Bash"
      ? { command: `npm test -- ${pick(rng, NOUNS)} --shard=${i}` }
      : toolName === "Grep"
        ? { pattern: pick(rng, CONCEPTS), path: `src/${pick(rng, NOUNS)}-${i}` }
        : { file_path: file };
  const lines: string[] = [`${headMarker} ${buildContent(rng, i)}`];
  let size = lines[0]!.length;
  while (size < outputBytes - tailMarker.length - 1) {
    const line = buildContent(rng, i);
    lines.push(line);
    size += line.length + 1;
  }
  lines.push(tailMarker);
  return {
    index: i,
    toolName,
    toolInput,
    toolOutput: lines.join("\n"),
    headMarker,
    tailMarker,
  };
}
