import { VectorIndex } from "../state/vector-index.js";

type DimensionMismatch = { obsId: string; dim: number };

type VectorDimensionMismatchErrorInput = {
  activeDim: number;
  activeProviderName: string;
  dataDir: string;
  envFile: string;
  envFileExists: boolean;
  loadedVectorSize: number;
  mismatches: DimensionMismatch[];
  seenDimensions: Set<number>;
};

type VectorDimensionMismatchInput = {
  activeDim: number;
  activeProviderName: string;
  dataDir: string;
  dropStale: boolean;
  envFile: string;
  envFileExists: boolean;
  indexPersistence: { save: () => Promise<void> };
  loadedVector: VectorIndex;
  targetVector: VectorIndex;
  warn?: (message?: unknown, ...optionalParams: unknown[]) => void;
};

export function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\"'\"'") + "'";
}

export function buildVectorDimensionMismatchError(
  input: VectorDimensionMismatchErrorInput,
): Error {
  const sample = input.mismatches
    .slice(0, 5)
    .map((m) => `${m.obsId} (dim=${m.dim})`)
    .join(", ");
  const distinct = Array.from(input.seenDimensions)
    .sort((a, b) => a - b)
    .join(", ");
  return new Error(
    `[agentmemory] Refusing to start: persisted vector index has ` +
      `${input.mismatches.length} of ${input.loadedVectorSize} vectors with ` +
      `the wrong dimension. Active provider (${input.activeProviderName}) ` +
      `declares ${input.activeDim}; dimensions seen on disk: ${distinct}. ` +
      `First mismatched obsIds: ${sample}. Loading would silently corrupt ` +
      `search (cross-dimension cosine returns 0).\n` +
      `\n` +
      `Resolved paths:\n` +
      `  data dir: ${input.dataDir}\n` +
      `  env file: ${input.envFile} (exists: ${input.envFileExists})\n` +
      `\n` +
      `Recovery - pick ONE:\n` +
      `  1. One-shot drop + rebuild (recommended):\n` +
      `       echo 'AGENTMEMORY_DROP_STALE_INDEX=true' >> ${shellQuote(input.envFile)}\n` +
      `       # restart agentmemory; the flag can be removed after the next clean boot.\n` +
      `  2. Re-embed the existing index against the new provider, then start.\n` +
      `  3. Switch the embedding provider back to the one that wrote the index.\n` +
      `\n` +
      `If running under a service manager (LaunchAgent, systemd, Docker), confirm\n` +
      `HOME points at the user account that owns ${input.dataDir} -\n` +
      `the .env file above is what the running process actually reads.`,
  );
}

export async function handleVectorDimensionMismatch(
  input: VectorDimensionMismatchInput,
): Promise<"clean" | "dropped"> {
  const { mismatches, seenDimensions } =
    input.loadedVector.validateDimensions(input.activeDim);
  if (mismatches.length === 0) {
    input.targetVector.restoreFrom(input.loadedVector);
    return "clean";
  }

  const distinct = Array.from(seenDimensions).sort((a, b) => a - b).join(", ");
  const warn = input.warn ?? console.warn;
  if (input.dropStale) {
    warn(
      `[agentmemory] Persisted vector index has ${mismatches.length} of ` +
        `${input.loadedVector.size} vectors with the wrong dimension. Active ` +
        `provider (${input.activeProviderName}) declares ${input.activeDim}; ` +
        `dimensions seen on disk: ${distinct}. ` +
        `AGENTMEMORY_DROP_STALE_INDEX=true is set - discarding the persisted ` +
        `vectors. Live observations will rebuild the index over time.`,
    );
    input.targetVector.clear();
    await input.indexPersistence.save().catch((err) => {
      warn(`[agentmemory] Failed to persist cleared vector index:`, err);
    });
    return "dropped";
  }

  throw buildVectorDimensionMismatchError({
    activeDim: input.activeDim,
    activeProviderName: input.activeProviderName,
    dataDir: input.dataDir,
    envFile: input.envFile,
    envFileExists: input.envFileExists,
    loadedVectorSize: input.loadedVector.size,
    mismatches,
    seenDimensions,
  });
}
