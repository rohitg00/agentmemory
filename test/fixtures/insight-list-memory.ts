import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { registerReflectFunctions } from "../../src/functions/reflect.js";
import { StateKV } from "../../src/state/kv.js";
import { KV } from "../../src/state/schema.js";

const backend = process.argv[2];
assert(backend === "file" || backend === "redis");
assert.equal(typeof global.gc, "function", "Run this probe with --expose-gc");

const count = 4096;
const functions = new Map<string, (data: unknown) => unknown>();
let reads = 0;
let peakHeapBytes = 0;
let modelRequests = 0;

function sampleHeap() {
  global.gc!();
  peakHeapBytes = Math.max(peakHeapBytes, process.memoryUsage().heapUsed);
}

function record(index: number) {
  const bytes = Buffer.alloc(12 * 1024, index % 251);
  bytes.writeUInt32LE(index);
  const concept = bytes.toString("base64");
  return JSON.parse(JSON.stringify({
    id: `historical-${index.toString().padStart(5, "0")}`,
    title: `Historical insight ${index}`,
    content: `Complete insight ${index}; Unicode Ж and é remain intact.`,
    confidence: (index + 1) / count,
    reinforcements: 3,
    sourceConceptCluster: [concept],
    sourceMemoryIds: [`memory-${index}`],
    sourceLessonIds: [],
    sourceCrystalIds: [],
    tags: [concept],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    decayRate: 0.05,
    project: "large-store",
    legacy_extra: { index, values: [0, false, null] },
  }));
}

const sdk = {
  registerFunction: (id: string | { id: string }, handler: (data: unknown) => unknown) => {
    functions.set(typeof id === "string" ? id : id.id, handler);
  },
  trigger: async ({ function_id, payload }: {
    function_id: string;
    payload: { scope: string; key?: string };
  }) => {
    assert.equal(payload.scope, KV.insights);
    if (function_id === "state::list_keys") {
      return Array.from({ length: count }, (_, index) => String(index));
    }
    assert.equal(function_id, "state::get");
    const index = Number(payload.key);
    assert(Number.isInteger(index) && index >= 0 && index < count);
    // Sample while the handler still owns earlier pages, before the next read.
    if (reads % 200 === 0) sampleHeap();
    reads++;
    return record(index);
  },
};

const unexpectedModel = async () => {
  modelRequests++;
  throw new Error("Listing insights must not request a model");
};
const kv = new StateKV(sdk as never, { backend });
registerReflectFunctions(sdk as never, kv, {
  name: "no-model",
  compress: unexpectedModel,
  summarize: unexpectedModel,
} as never);

sampleHeap();
const baselineHeapBytes = peakHeapBytes;
const result = await functions.get("mem::insight-list")!({ limit: 1, project: "large-store" });
sampleHeap();
assert.deepEqual(result, { success: true, insights: [record(count - 1)] });
assert.equal(reads, count);
assert.equal(modelRequests, 0);
console.log(JSON.stringify({
  backend,
  records: count,
  reads,
  modelRequests,
  baselineHeapBytes,
  peakHeapBytes,
  heapGrowthBytes: peakHeapBytes - baselineHeapBytes,
  completeResultSha256: createHash("sha256").update(JSON.stringify(result)).digest("hex"),
}));
