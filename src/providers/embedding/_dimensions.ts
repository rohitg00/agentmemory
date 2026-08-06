/**
 * Shared embedding-dimension logic for OpenAI-compatible providers.
 *
 * OpenAI and OpenRouter expose the same underlying embedding models, so they
 * share one dimension table and one resolver. OpenRouter namespaces model ids
 * (e.g. "openai/text-embedding-3-small"); the lookup strips a leading
 * "provider/" prefix so both bare and namespaced keys resolve to the same
 * dimensions.
 *
 * The dimension guard (index.ts) throws on mismatch, so a wrong value here
 * breaks every embed call — keep entries accurate. Callers pass the relevant
 * env-var name (OPENAI_EMBEDDING_DIMENSIONS / OPENROUTER_EMBEDDING_DIMENSIONS)
 * so error messages point at the knob the operator actually set.
 */
const MODEL_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
};

const DEFAULT_DIMENSIONS = 1536;

function lookupModelDimensions(model: string): number | undefined {
  if (model in MODEL_DIMENSIONS) return MODEL_DIMENSIONS[model];
  const slash = model.indexOf("/");
  if (slash === -1) return undefined;
  const bare = model.slice(slash + 1);
  return MODEL_DIMENSIONS[bare];
}

export function resolveDimensions(
  model: string,
  override: string | undefined,
  envName: string,
): number {
  if (override !== undefined && override.trim().length > 0) {
    const parsed = parseInt(override, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(
        `${envName} must be a positive integer, got: ${override}`,
      );
    }
    return parsed;
  }
  return lookupModelDimensions(model) ?? DEFAULT_DIMENSIONS;
}

export { MODEL_DIMENSIONS, DEFAULT_DIMENSIONS };
