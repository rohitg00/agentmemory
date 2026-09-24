// OrcaRouter model discovery and capability filtering.
//
// The authoritative model list is `GET <apiBase>/v1/models`. A successful live
// response is the whole truth — the verified seed is only ever a fallback for
// when discovery fails, and is never merged into a live result.
//
// Every entry that reaches a model selector is filtered by what the calling
// entry point can actually do with it. Capability comes from catalog metadata
// only; nothing here infers a capability from a model's name.

import { getEnvVar } from "../config.js";
import { type OrcaRouterOrigins, modelsUrl } from "./origins.js";

/** Hard bound on the discovery request. A slow catalog must not hang the UI. */
export const CATALOG_TIMEOUT_MS = 15_000;
/** Hard bound on the response size we are willing to buffer. */
export const CATALOG_MAX_BYTES = 4 * 1024 * 1024;
/** Hard bound on the number of records we will consider. */
export const CATALOG_MAX_ITEMS = 5_000;

export type CatalogSource = "live" | "seed" | "last-known-good";

export type Capability =
  | "chat"
  | "multimodal"
  | "embedding"
  | "image"
  | "video"
  | "rerank";

/**
 * Endpoint types a text chat request can be routed through. Anything whose
 * advertised endpoint types are disjoint from this set is not a chat model for
 * our purposes, even if it is listed in the catalog.
 */
export const CHAT_ENDPOINT_TYPES = [
  "openai",
  "anthropic",
  "gemini",
  "openai-response",
] as const;

/** Endpoint types that mark a record as dedicated to a non-chat modality. */
const NON_CHAT_ENDPOINT_TYPES = new Set([
  "image-generation",
  "openai-video",
  "jina-rerank",
  "embeddings",
]);

export interface ModelCapabilities {
  /** Endpoint types advertised by the catalog, verbatim. */
  supportedEndpointTypes: string[];
  /** `architecture.input_modalities` when the catalog declares it. */
  inputModalities: string[];
  /** `architecture.output_modalities` when the catalog declares it. */
  outputModalities: string[];
}

export interface CatalogModel {
  /** Vendor-namespaced id, preserved verbatim (`openai/gpt-5.5`). */
  id: string;
  name: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  /** Reasoning-effort ladder when the model advertises reasoning support. */
  reasoningEfforts?: string[];
  capabilities: ModelCapabilities;
  /** Set only on entries that came from the verified seed, never on live ones. */
  verified?: boolean;
  source: CatalogSource;
}

export interface ModelCatalog {
  models: CatalogModel[];
  source: CatalogSource;
  /**
   * True when the list did not come from a successful live fetch. The UI must
   * say so rather than present it as the workspace's real catalog.
   */
  degraded: boolean;
  /** Human-readable reason for `degraded`, already safe to display. */
  degradedReason?: string;
  /** When the fetch happened (epoch ms). Absent for the seed. */
  fetchedAt?: number;
}

/**
 * Verified cold-start / outage fallback. Deliberately tiny, and every entry
 * carries the metadata the catalog reports for it — in particular the
 * reasoning-effort ladder, which must not be dropped when discovery is
 * unavailable.
 *
 * Reasoning effort ladders follow the OpenAI `reasoning_effort` values, and
 * input modalities follow `architecture.input_modalities`.
 */
export const VERIFIED_SEED_MODELS: ReadonlyArray<
  Omit<CatalogModel, "source">
> = [
  {
    id: "openai/gpt-5.5",
    name: "GPT-5.5",
    contextWindow: 400_000,
    maxOutputTokens: 128_000,
    reasoningEfforts: ["low", "medium", "high", "xhigh"],
    capabilities: {
      supportedEndpointTypes: ["openai", "openai-response"],
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
    },
    verified: true,
  },
  {
    id: "anthropic/claude-opus-4.8",
    name: "Claude Opus 4.8",
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    reasoningEfforts: ["low", "medium", "high"],
    capabilities: {
      supportedEndpointTypes: ["anthropic", "openai"],
      inputModalities: ["text", "image"],
      outputModalities: ["text"],
    },
    verified: true,
  },
  {
    id: "google/gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    capabilities: {
      supportedEndpointTypes: ["gemini", "openai"],
      inputModalities: ["text", "image", "audio", "video"],
      outputModalities: ["text"],
    },
    verified: true,
  },
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    contextWindow: 160_000,
    maxOutputTokens: 32_768,
    capabilities: {
      supportedEndpointTypes: ["openai"],
      inputModalities: ["text"],
      outputModalities: ["text"],
    },
    verified: true,
  },
  {
    // Meta-router: OrcaRouter picks the model. No declared input modalities, so
    // it is chat-only and excluded from multimodal lists (fail closed).
    id: "orcarouter/auto",
    name: "OrcaRouter Auto",
    contextWindow: 200_000,
    capabilities: {
      supportedEndpointTypes: ["openai"],
      inputModalities: ["text"],
      outputModalities: ["text"],
    },
    verified: true,
  },
];

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function asPositiveInt(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.floor(value);
}

/**
 * A record's endpoint types, from the top-level `supported_endpoint_types`
 * field or a `supported_endpoints` alias. Some catalogs nest it under the
 * architecture block, so accept that too rather than dropping the record's
 * only capability evidence.
 */
function extractEndpointTypes(record: Record<string, unknown>): string[] {
  const top = asStringArray(record["supported_endpoint_types"]);
  if (top.length > 0) return top;
  const alias = asStringArray(record["supported_endpoints"]);
  if (alias.length > 0) return alias;
  const arch = record["architecture"];
  if (arch && typeof arch === "object") {
    const nested = asStringArray(
      (arch as Record<string, unknown>)["supported_endpoint_types"],
    );
    if (nested.length > 0) return nested;
  }
  return [];
}

function extractArchitecture(record: Record<string, unknown>): {
  input: string[];
  output: string[];
} {
  const arch = record["architecture"];
  if (!arch || typeof arch !== "object") return { input: [], output: [] };
  const a = arch as Record<string, unknown>;
  return {
    input: asStringArray(a["input_modalities"]),
    output: asStringArray(a["output_modalities"]),
  };
}

/**
 * Reasoning-effort ladder. Only preserved when the record actually advertises
 * reasoning support — otherwise an effort value passed to a non-reasoning
 * model is a hard API error downstream.
 */
function extractReasoningEfforts(record: Record<string, unknown>): string[] | undefined {
  const params = record["supported_parameters"];
  if (Array.isArray(params)) {
    const names = asStringArray(params.map((p) =>
      p && typeof p === "object" ? (p as Record<string, unknown>)["name"] : p,
    ));
    if (!names.includes("reasoning_effort") && !names.includes("reasoning")) {
      return undefined;
    }
  }
  const declared = asStringArray(record["reasoning_efforts"]);
  if (declared.length > 0) return declared;
  const effort = record["reasoning_effort"];
  if (typeof effort === "string" && effort) return [effort];
  return undefined;
}

/**
 * Parse one `/v1/models` record. Returns null for anything that does not look
 * like a model entry, so a malformed record is skipped rather than poisoning
 * the list.
 */
export function parseCatalogRecord(raw: unknown): CatalogModel | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  const id = typeof record["id"] === "string" ? record["id"].trim() : "";
  if (!id) return null;

  const arch = extractArchitecture(record);
  const name =
    typeof record["name"] === "string" && record["name"].trim()
      ? record["name"].trim()
      : id;

  return {
    id,
    name,
    contextWindow:
      asPositiveInt(record["context_length"]) ??
      asPositiveInt(record["context_window"]) ??
      asPositiveInt(record["max_context_length"]),
    maxOutputTokens:
      asPositiveInt(record["max_output_tokens"]) ??
      asPositiveInt(record["top_provider"] && typeof record["top_provider"] === "object"
        ? (record["top_provider"] as Record<string, unknown>)["max_completion_tokens"]
        : undefined),
    reasoningEfforts: extractReasoningEfforts(record),
    capabilities: {
      supportedEndpointTypes: extractEndpointTypes(record),
      inputModalities: arch.input,
      outputModalities: arch.output,
    },
    source: "live",
  };
}

/** Parse a `/v1/models` body (`{ data: [...] }` or a bare array). */
export function parseCatalog(body: unknown): CatalogModel[] {
  const list = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray((body as Record<string, unknown>)["data"])
      ? ((body as Record<string, unknown>)["data"] as unknown[])
      : [];
  const out: CatalogModel[] = [];
  for (const raw of list.slice(0, CATALOG_MAX_ITEMS)) {
    const parsed = parseCatalogRecord(raw);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Does this record advertise a text chat endpoint we can speak?
 *
 * Endpoint types are the primary signal. A record that lists no endpoint types
 * at all is judged on its declared output modalities when present, and is
 * otherwise rejected — the catalog is the only source of truth for capability.
 */
export function isChatModel(model: CatalogModel): boolean {
  const types = model.capabilities.supportedEndpointTypes.map((t) => t.toLowerCase());
  if (types.length > 0) {
    if (types.some((t) => NON_CHAT_ENDPOINT_TYPES.has(t))) {
      // A record can advertise several; only reject when it offers no chat
      // endpoint alongside its speciality.
      if (!types.some((t) => (CHAT_ENDPOINT_TYPES as readonly string[]).includes(t))) {
        return false;
      }
    }
    return types.some((t) => (CHAT_ENDPOINT_TYPES as readonly string[]).includes(t));
  }
  const out = model.capabilities.outputModalities.map((m) => m.toLowerCase());
  if (out.length > 0) return out.includes("text");
  return false;
}

/**
 * Chat model that explicitly declares it accepts `modality` as input.
 *
 * Fail closed: a model whose `architecture.input_modalities` is absent or does
 * not name the modality is excluded. This is what keeps image attachments from
 * being offered models that cannot read them.
 */
export function supportsInput(model: CatalogModel, modality: string): boolean {
  if (!isChatModel(model)) return false;
  return model.capabilities.inputModalities
    .map((m) => m.toLowerCase())
    .includes(modality.toLowerCase());
}

export function isEmbeddingModel(model: CatalogModel): boolean {
  const types = model.capabilities.supportedEndpointTypes.map((t) => t.toLowerCase());
  if (types.includes("embeddings")) return true;
  if (types.length > 0) return false;
  // No endpoint types declared: only an explicit embedding-shaped output
  // modality is acceptable evidence.
  return model.capabilities.outputModalities
    .map((m) => m.toLowerCase())
    .includes("embedding");
}

export function isImageGenerationModel(model: CatalogModel): boolean {
  return model.capabilities.supportedEndpointTypes
    .map((t) => t.toLowerCase())
    .includes("image-generation");
}

export function isVideoModel(model: CatalogModel): boolean {
  return model.capabilities.supportedEndpointTypes
    .map((t) => t.toLowerCase())
    .includes("openai-video");
}

export function isRerankModel(model: CatalogModel): boolean {
  return model.capabilities.supportedEndpointTypes
    .map((t) => t.toLowerCase())
    .includes("jina-rerank");
}

/**
 * The one filter every model selector goes through. `capability` selects the
 * predicate; `inputModality` narrows a chat list to models that declare that
 * input type.
 */
export function filterModels(
  models: readonly CatalogModel[],
  capability: Capability,
  inputModality?: string,
): CatalogModel[] {
  switch (capability) {
    case "chat":
      return models.filter(isChatModel);
    case "multimodal": {
      const modality = inputModality ?? "image";
      return models.filter((m) => supportsInput(m, modality));
    }
    case "embedding":
      return models.filter(isEmbeddingModel);
    case "image":
      return models.filter(isImageGenerationModel);
    case "video":
      return models.filter(isVideoModel);
    case "rerank":
      return models.filter(isRerankModel);
    default:
      return [];
  }
}

export function seedCatalog(reason?: string): ModelCatalog {
  return {
    models: VERIFIED_SEED_MODELS.map((m) => ({ ...m, source: "seed" as const })),
    source: "seed",
    degraded: true,
    degradedReason:
      reason ??
      "Showing a small verified model list — live discovery from OrcaRouter has not run yet.",
  };
}

export interface FetchCatalogOptions {
  origins: OrcaRouterOrigins;
  /** The user's OrcaRouter key. Stays server-side; never sent to a browser. */
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Catalog previously fetched successfully, used when live discovery fails. */
  lastKnownGood?: ModelCatalog;
}

/**
 * Fetch the workspace's real model catalog.
 *
 * On any failure this degrades rather than throwing: a fresh install with a
 * flaky network must still show the verified seed, but it is always labelled
 * as degraded so nothing pretends a seed is the live catalog.
 */
export async function fetchModelCatalog(
  opts: FetchCatalogOptions,
): Promise<ModelCatalog> {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? CATALOG_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const fallback = (reason: string): ModelCatalog => {
    if (opts.lastKnownGood && opts.lastKnownGood.models.length > 0) {
      return {
        models: opts.lastKnownGood.models.map((m) => ({
          ...m,
          source: "last-known-good" as const,
        })),
        source: "last-known-good",
        degraded: true,
        degradedReason: reason,
        fetchedAt: opts.lastKnownGood.fetchedAt,
      };
    }
    return seedCatalog(reason);
  };

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    // Prefer the user's key so the catalog reflects what this workspace can
    // actually call. Falls back to an unauthenticated request, which some
    // deployments allow.
    if (opts.apiKey) headers["Authorization"] = `Bearer ${opts.apiKey}`;

    const res = await doFetch(modelsUrl(opts.origins), {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) {
      return fallback(
        "OrcaRouter rejected the API key while listing models. Reconnect OrcaRouter to refresh the credential.",
      );
    }
    if (!res.ok) {
      return fallback(
        `OrcaRouter model discovery failed (HTTP ${res.status}).`,
      );
    }

    const text = await readBoundedText(res, CATALOG_MAX_BYTES);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return fallback("OrcaRouter model discovery returned an unreadable response.");
    }

    const models = parseCatalog(body);
    if (models.length === 0) {
      return fallback("OrcaRouter model discovery returned no usable models.");
    }

    // Live success is authoritative — the seed is not mixed in.
    return {
      models,
      source: "live",
      degraded: false,
      fetchedAt: Date.now(),
    };
  } catch {
    return fallback(
      "Could not reach OrcaRouter to list models. Showing the last verified list.",
    );
  } finally {
    clearTimeout(timer);
  }
}

async function readBoundedText(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
    }
  } catch {
    /* truncated body is still parsed by the caller */
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

/** Env-driven model override, mirroring the repo's `<PROVIDER>_MODEL` idiom. */
export function orcaRouterDefaultModel(): string {
  return getEnvVar("ORCAROUTER_MODEL") || "orcarouter/auto";
}
