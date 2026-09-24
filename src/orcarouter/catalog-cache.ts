// Process-wide model-catalog cache.
//
// The viewer polls the catalog from more than one panel (chat selector,
// multimodal selector, embedding selector), so discovery is fetched once and
// shared. A successful live fetch is authoritative and is remembered as
// last-known-good, so a later outage degrades to the real workspace list
// instead of a generic seed.

import {
  type Capability,
  type ModelCatalog,
  fetchModelCatalog,
  parseCatalog,
} from "./catalog.js";
import {
  readLastKnownGoodCatalog,
  resolveCredential,
  writeLastKnownGoodCatalog,
} from "./credentials.js";
import { type OrcaRouterOrigins, resolveOrigins } from "./origins.js";

/**
 * How long a successful live catalog is reused before refetching. Long enough
 * that flipping between panels does not re-hit the relay, short enough that a
 * newly available model shows up without a restart.
 */
export const CATALOG_TTL_MS = 5 * 60_000;

let cached: ModelCatalog | null = null;
let inflight: Promise<ModelCatalog> | null = null;
/**
 * When the cached entry was stored, on the same clock the staleness check
 * uses. Kept separate from `catalog.fetchedAt` (which is the relay's own
 * fetch time) so a caller can drive both from one injected clock.
 */
let cachedAt = 0;

export function __resetCatalogCache(): void {
  cached = null;
  inflight = null;
  cachedAt = 0;
}

const CAPABILITIES: readonly Capability[] = [
  "chat",
  "multimodal",
  "embedding",
  "image",
  "video",
  "rerank",
];

/** Parse a `capability` query value. Returns null for anything unsupported. */
export function asCapability(raw: string): Capability | null {
  const value = raw.trim().toLowerCase();
  return (CAPABILITIES as readonly string[]).includes(value)
    ? (value as Capability)
    : null;
}

export function supportedCapabilities(): Capability[] {
  return [...CAPABILITIES];
}

function hydrateLastKnownGood(): ModelCatalog | null {
  const stored = readLastKnownGoodCatalog();
  if (!stored) return null;
  try {
    const parsed = parseCatalog({ data: stored.catalog });
    if (parsed.length === 0) return null;
    return {
      models: parsed.map((m) => ({ ...m, source: "last-known-good" as const })),
      source: "last-known-good",
      degraded: true,
      fetchedAt: stored.at || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Return the catalog, fetching it when the cache is cold or stale.
 *
 * Concurrent callers share one in-flight request rather than each opening
 * their own — the relay's catalog endpoint is not free, and a burst of panel
 * renders must not become a burst of upstream requests.
 */
export async function getCatalog(
  forceRefresh = false,
  opts?: {
    origins?: OrcaRouterOrigins;
    fetchImpl?: typeof fetch;
    apiKey?: string;
    now?: number;
  },
): Promise<ModelCatalog> {
  const now = opts?.now ?? Date.now();
  if (
    !forceRefresh &&
    cached &&
    !cached.degraded &&
    cachedAt > 0 &&
    now - cachedAt < CATALOG_TTL_MS
  ) {
    return cached;
  }
  // A degraded result is not cached — the next panel render should retry
  // discovery rather than pin an outage in place. In-flight requests are still
  // shared, so a burst of renders does not become a burst of upstream calls.
  if (!forceRefresh && inflight) return inflight;

  const run = async (): Promise<ModelCatalog> => {
    const credential = resolveCredential();
    const catalog = await fetchModelCatalog({
      origins: opts?.origins ?? resolveOrigins(),
      apiKey: opts?.apiKey ?? credential?.apiKey,
      fetchImpl: opts?.fetchImpl,
      lastKnownGood: hydrateLastKnownGood() ?? undefined,
    });
    if (catalog.source === "live") {
      writeLastKnownGoodCatalog(catalog.models.map((m) => ({
        id: m.id,
        name: m.name,
        context_length: m.contextWindow,
        max_output_tokens: m.maxOutputTokens,
        reasoning_efforts: m.reasoningEfforts,
        supported_endpoint_types: m.capabilities.supportedEndpointTypes,
        architecture: {
          input_modalities: m.capabilities.inputModalities,
          output_modalities: m.capabilities.outputModalities,
        },
      })));
    }
    if (!catalog.degraded) {
      cached = catalog;
      cachedAt = now;
    }
    return catalog;
  };

  inflight = run().finally(() => {
    inflight = null;
  });
  return inflight;
}
