import type { ISdk } from "iii-sdk";
import { getContext } from "iii-sdk";
import type {
  CompressedObservation,
  EnrichedChunk,
  MemoryProvider,
} from "../types.js";
import { KV, generateId } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";

const SLIDING_WINDOW_SYSTEM = `You are a contextual enrichment engine. Given a primary observation and its surrounding context window (previous and next observations from the same session), produce an enriched version.

Your tasks:
1. ENTITY RESOLUTION: Replace all pronouns, implicit references ("that framework", "the file", "it", "he/she") with the explicit entity names found in the context window.
2. PREFERENCE MAPPING: Extract any user preferences, constraints, or opinions expressed directly or indirectly.
3. CONTEXT BRIDGES: Add brief contextual links that make this chunk self-contained without reading adjacent chunks.

Output EXACTLY this XML:
<enriched>
  <content>The fully enriched, self-contained text with all references resolved</content>
  <resolved_entities>
    <entity original="pronoun or reference" resolved="explicit entity name"/>
  </resolved_entities>
  <preferences>
    <preference>extracted user preference or constraint</preference>
  </preferences>
  <context_bridges>
    <bridge>contextual link to adjacent information</bridge>
  </context_bridges>
</enriched>

Rules:
- The enriched content MUST be understandable in complete isolation
- Resolve ALL ambiguous references using the context window
- Do not hallucinate entities not present in the window
- Preserve factual accuracy while adding clarity`;

function buildWindowPrompt(
  primary: CompressedObservation,
  before: CompressedObservation[],
  after: CompressedObservation[],
): string {
  const parts: string[] = [];

  if (before.length > 0) {
    parts.push("=== PRECEDING CONTEXT ===");
    for (const obs of before) {
      parts.push(`[${obs.type}] ${obs.title}: ${obs.narrative}`);
      if (obs.facts.length > 0) parts.push(`Facts: ${obs.facts.join("; ")}`);
      if (obs.concepts.length > 0)
        parts.push(`Concepts: ${obs.concepts.join(", ")}`);
    }
  }

  parts.push("\n=== PRIMARY OBSERVATION (enrich this) ===");
  parts.push(`Type: ${primary.type}`);
  parts.push(`Title: ${primary.title}`);
  if (primary.subtitle) parts.push(`Subtitle: ${primary.subtitle}`);
  parts.push(`Narrative: ${primary.narrative}`);
  if (primary.facts.length > 0)
    parts.push(`Facts: ${primary.facts.join("; ")}`);
  if (primary.concepts.length > 0)
    parts.push(`Concepts: ${primary.concepts.join(", ")}`);
  if (primary.files.length > 0)
    parts.push(`Files: ${primary.files.join(", ")}`);

  if (after.length > 0) {
    parts.push("\n=== FOLLOWING CONTEXT ===");
    for (const obs of after) {
      parts.push(`[${obs.type}] ${obs.title}: ${obs.narrative}`);
      if (obs.facts.length > 0) parts.push(`Facts: ${obs.facts.join("; ")}`);
    }
  }

  return parts.join("\n");
}

function parseEnrichedXml(xml: string): {
  content: string;
  resolvedEntities: Record<string, string>;
  preferences: string[];
  contextBridges: string[];
} | null {
  const contentMatch = xml.match(/<content>([\s\S]*?)<\/content>/);
  if (!contentMatch) return null;

  const resolvedEntities: Record<string, string> = {};
  const entityRegex =
    /<entity\s+original="([^"]+)"\s+resolved="([^"]+)"\s*\/>/g;
  let match;
  while ((match = entityRegex.exec(xml)) !== null) {
    resolvedEntities[match[1]] = match[2];
  }

  const preferences: string[] = [];
  const prefRegex = /<preference>([^<]+)<\/preference>/g;
  while ((match = prefRegex.exec(xml)) !== null) {
    preferences.push(match[1]);
  }

  const contextBridges: string[] = [];
  const bridgeRegex = /<bridge>([^<]+)<\/bridge>/g;
  while ((match = bridgeRegex.exec(xml)) !== null) {
    contextBridges.push(match[1]);
  }

  return {
    content: contentMatch[1].trim(),
    resolvedEntities,
    preferences,
    contextBridges,
  };
}

export function registerSlidingWindowFunction(
  sdk: ISdk,
  kv: StateKV,
  provider: MemoryProvider,
): void {
  sdk.registerFunction(
    {
      id: "mem::enrich-window",
      description:
        "Enrich observation using sliding window context for self-containment",
    },
    async (data: {
      observationId: string;
      sessionId: string;
      lookback?: number;
      lookahead?: number;
    }) => {
      const ctx = getContext();
      const hprev = data.lookback ?? 3;
      const hnext = data.lookahead ?? 2;

      const allObs = await kv.list<CompressedObservation>(
        KV.observations(data.sessionId),
      );
      allObs.sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      const primaryIdx = allObs.findIndex((o) => o.id === data.observationId);
      if (primaryIdx === -1) {
        return { success: false, error: "Observation not found" };
      }

      const primary = allObs[primaryIdx];
      const before = allObs.slice(Math.max(0, primaryIdx - hprev), primaryIdx);
      const after = allObs.slice(primaryIdx + 1, primaryIdx + 1 + hnext);

      if (before.length === 0 && after.length === 0) {
        return {
          success: true,
          enriched: null,
          reason: "No adjacent context available",
        };
      }

      try {
        const prompt = buildWindowPrompt(primary, before, after);
        const response = await provider.compress(
          SLIDING_WINDOW_SYSTEM,
          prompt,
        );
        const parsed = parseEnrichedXml(response);

        if (!parsed) {
          ctx.logger.warn("Failed to parse enrichment XML", {
            obsId: data.observationId,
          });
          return { success: false, error: "parse_failed" };
        }

        const enriched: EnrichedChunk = {
          id: generateId("ec"),
          originalObsId: data.observationId,
          sessionId: data.sessionId,
          content: parsed.content,
          resolvedEntities: parsed.resolvedEntities,
          preferences: parsed.preferences,
          contextBridges: parsed.contextBridges,
          windowStart: Math.max(0, primaryIdx - hprev),
          windowEnd: Math.min(allObs.length - 1, primaryIdx + hnext),
          createdAt: new Date().toISOString(),
        };

        await kv.set(
          KV.enrichedChunks(data.sessionId),
          data.observationId,
          enriched,
        );

        ctx.logger.info("Observation enriched via sliding window", {
          obsId: data.observationId,
          entitiesResolved: Object.keys(parsed.resolvedEntities).length,
          preferencesFound: parsed.preferences.length,
          bridges: parsed.contextBridges.length,
        });

        return { success: true, enriched };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.logger.error("Sliding window enrichment failed", { error: msg });
        return { success: false, error: msg };
      }
    },
  );

  sdk.registerFunction(
    {
      id: "mem::enrich-session",
      description: "Enrich all observations in a session using sliding windows",
    },
    async (data: {
      sessionId: string;
      lookback?: number;
      lookahead?: number;
      minImportance?: number;
    }) => {
      const ctx = getContext();
      const allObs = await kv.list<CompressedObservation>(
        KV.observations(data.sessionId),
      );
      const minImp = data.minImportance ?? 4;
      const toEnrich = allObs.filter((o) => o.importance >= minImp);

      let enriched = 0;
      let failed = 0;

      for (const obs of toEnrich) {
        try {
          const result = (await sdk.trigger("mem::enrich-window", {
            observationId: obs.id,
            sessionId: data.sessionId,
            lookback: data.lookback ?? 3,
            lookahead: data.lookahead ?? 2,
          })) as { success?: boolean } | undefined;
          if (result?.success) enriched++;
          else failed++;
        } catch {
          failed++;
        }
      }

      ctx.logger.info("Session enrichment complete", {
        sessionId: data.sessionId,
        total: toEnrich.length,
        enriched,
        failed,
      });

      return { success: true, total: toEnrich.length, enriched, failed };
    },
  );
}
