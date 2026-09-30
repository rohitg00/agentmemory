import type { CompressedObservation, HookType, ObservationSource, RawObservation } from "../types.js";
import { stripPrivateData } from "./privacy.js";

export const OBSERVATION_SOURCE_MAX_BYTES = 16 * 1024;

function sanitize(value: unknown): unknown {
  if (typeof value === "string") return stripPrivateData(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [stripPrivateData(key), sanitize(entry)]));
  }
  return value;
}

function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function prefixWithinBytes(text: string, budget: number): string {
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (bytes(text.slice(0, mid)) <= budget) low = mid;
    else high = mid - 1;
  }
  if (low > 0 && /[\uD800-\uDBFF]/.test(text[low - 1])) low--;
  return text.slice(0, low);
}

export function createObservationSource(
  raw: RawObservation,
  previous?: Pick<ObservationSource, "originalBytes" | "truncated">,
  maxBytes = OBSERVATION_SOURCE_MAX_BYTES,
): ObservationSource {
  const fields: Record<string, unknown> = {
    toolName: raw.toolName,
    toolInput: raw.toolInput,
    toolOutput: raw.toolOutput,
    userPrompt: raw.userPrompt,
    assistantResponse: raw.assistantResponse,
  };
  if (Object.values(fields).every((value) => value === undefined)) fields.payload = raw.raw;
  const retained = sanitize(fields) as Record<string, unknown>;
  const hookType = prefixWithinBytes(stripPrivateData(raw.hookType), 128) as HookType;
  const originalBytes = Math.max(bytes({ hookType: raw.hookType, ...retained }), previous?.originalBytes ?? 0);
  const truncated = previous?.truncated === true || hookType !== raw.hookType;
  const full = { hookType, originalBytes, truncated, ...retained };
  if (bytes(full) <= maxBytes) return full;

  const bounded: ObservationSource = { hookType, originalBytes, truncated: true };
  for (const [key, value] of Object.entries(retained)) {
    if (value === undefined) continue;
    if (bytes({ ...bounded, [key]: value }) <= maxBytes) {
      Object.assign(bounded, { [key]: value });
      continue;
    }
    const budget = maxBytes - bytes({ ...bounded, [key]: "" }) + 2;
    if (budget >= 2) {
      const text = typeof value === "string" ? value : JSON.stringify(value);
      Object.assign(bounded, { [key]: prefixWithinBytes(text, budget) });
    }
    break;
  }
  return bounded;
}

export function normalizeObservationSource(value: unknown, maxBytes = OBSERVATION_SOURCE_MAX_BYTES): ObservationSource | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  if (typeof source.hookType !== "string" || !source.hookType) return undefined;
  return createObservationSource({
    id: "", sessionId: "", timestamp: "",
    hookType: source.hookType as HookType,
    toolName: typeof source.toolName === "string" ? source.toolName : undefined,
    toolInput: source.toolInput,
    toolOutput: source.toolOutput,
    userPrompt: typeof source.userPrompt === "string" ? source.userPrompt : undefined,
    assistantResponse: typeof source.assistantResponse === "string" ? source.assistantResponse : undefined,
    raw: source.payload,
  }, {
    originalBytes: Number.isSafeInteger(source.originalBytes) && (source.originalBytes as number) >= 0
      ? source.originalBytes as number : 0,
    truncated: source.truncated === true,
  }, maxBytes);
}

export function withoutObservationSource<T extends CompressedObservation>(observation: T): Omit<T, "source"> {
  const { source: _source, ...summary } = observation;
  return summary;
}

export function rawFromObservationSource(observation: CompressedObservation): RawObservation | null {
  const source = observation.source;
  if (!source || typeof source.hookType !== "string") return null;
  return {
    id: observation.id,
    sessionId: observation.sessionId,
    timestamp: observation.timestamp,
    hookType: source.hookType,
    toolName: source.toolName,
    toolInput: source.toolInput,
    toolOutput: source.toolOutput,
    userPrompt: source.userPrompt,
    assistantResponse: source.assistantResponse,
    raw: source.payload ?? {},
    modality: observation.modality,
    imageData: observation.imageRef ?? observation.imageData,
    agentId: observation.agentId,
    origin: observation.origin,
  };
}
