import type { IndexPersistence } from "./index-persistence.js";
import { VectorIndex } from "./vector-index.js";

export type VectorIndexRecoveryPaths = {
  configDir: string;
  envFile: string;
  envFileExists: () => boolean;
};

type RecoverPersistedVectorIndexOptions = {
  persistedIndex: VectorIndex;
  activeIndex: VectorIndex;
  expectedDimensions: number;
  providerName: string;
  dropStale: boolean;
  persistence: Pick<IndexPersistence, "save">;
  paths: VectorIndexRecoveryPaths;
  warn?: (message: string, error?: unknown) => void;
};

export async function recoverPersistedVectorIndex({
  persistedIndex,
  activeIndex,
  expectedDimensions,
  providerName,
  dropStale,
  persistence,
  paths,
  warn = console.warn,
}: RecoverPersistedVectorIndexOptions): Promise<"dropped" | "restored"> {
  const { mismatches, seenDimensions } =
    persistedIndex.validateDimensions(expectedDimensions);
  if (mismatches.length === 0) {
    activeIndex.restoreFrom(persistedIndex);
    return "restored";
  }

  const distinct = Array.from(seenDimensions)
    .sort((a, b) => a - b)
    .join(", ");
  if (dropStale) {
    warn(
      `[agentmemory] Persisted vector index has ${mismatches.length} of ` +
        `${persistedIndex.size} vectors with the wrong dimension. Active ` +
        `provider (${providerName}) declares ${expectedDimensions}; ` +
        `dimensions seen on disk: ${distinct}. ` +
        `AGENTMEMORY_DROP_STALE_INDEX=true is set — discarding the persisted ` +
        `vectors. Live observations will rebuild the index over time.`,
    );
    try {
      await persistence.save({ throwOnError: true });
    } catch (error) {
      warn(
        "[agentmemory] Failed to persist cleared vector index; startup remains blocked:",
        error,
      );
      throw error;
    }
    return "dropped";
  }

  const sample = mismatches
    .slice(0, 5)
    .map((mismatch) => `${mismatch.obsId} (dim=${mismatch.dim})`)
    .join(", ");
  const envExists = paths.envFileExists();
  throw new Error(
    `[agentmemory] Refusing to start: persisted vector index has ` +
      `${mismatches.length} of ${persistedIndex.size} vectors with the ` +
      `wrong dimension. Active provider (${providerName}) declares ` +
      `${expectedDimensions}; dimensions seen on disk: ${distinct}. ` +
      `First mismatched obsIds: ${sample}. Loading would silently corrupt ` +
      `search (cross-dimension cosine returns 0).\n` +
      `\n` +
      `Resolved paths:\n` +
      `  config directory: ${paths.configDir}\n` +
      `  env file: ${paths.envFile} (exists: ${envExists})\n` +
      `\n` +
      `Recovery — pick ONE:\n` +
      `  1. Add AGENTMEMORY_DROP_STALE_INDEX=true to ${paths.envFile}, ` +
      `then restart agentmemory. Remove the flag after the next clean boot.\n` +
      `  2. Re-embed the existing index against the new provider, then start.\n` +
      `  3. Switch the embedding provider back to the one that wrote the index.\n` +
      `\n` +
      `If running under a service manager (LaunchAgent, systemd, Docker), ` +
      `confirm HOME resolves ${paths.configDir}; the env file above is what ` +
      `the running process actually reads.`,
  );
}
