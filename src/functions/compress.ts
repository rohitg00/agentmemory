import { TriggerAction, type ISdk } from "iii-sdk";
import { readFileSync } from "node:fs";
import { isManagedImagePath } from "../utils/image-store.js";
import type {
  RawObservation,
  CompressedObservation,
  ObservationType,
  MemoryProvider,
} from "../types.js";
import { KV, STREAM } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import {
  COMPRESSION_SYSTEM,
  buildCompressionPrompt,
} from "../prompts/compression.js";
import { VISION_DESCRIPTION_PROMPT } from "../prompts/vision.js";
import { getXmlTag, getXmlChildren } from "../prompts/xml.js";
import { getSearchIndex } from "./search.js";
import { CompressOutputSchema } from "../eval/schemas.js";
import { validateOutput } from "../eval/validator.js";
import { scoreCompression } from "../eval/quality.js";
import { compressWithRetry } from "../eval/self-correct.js";
import type { MetricsStore } from "../eval/metrics-store.js";
import { logger } from "../logger.js";

const VALID_TYPES = new Set<string>([
  "file_read",
  "file_write",
  "file_edit",
  "command_run",
  "search",
  "web_fetch",
  "conversation",
  "error",
  "decision",
  "discovery",
  "subagent",
  "notification",
  "task",
  "image",
  "other",
]);

function parseCompressionXml(
  xml: string,
): Omit<CompressedObservation, "id" | "sessionId" | "timestamp"> | null {
  const rawType = getXmlTag(xml, "type");
  const title = getXmlTag(xml, "title");
  if (!rawType || !title) return null;
  const type = VALID_TYPES.has(rawType) ? rawType : "other";

  return {
    type: type as ObservationType,
    title,
    subtitle: getXmlTag(xml, "subtitle") || undefined,
    facts: getXmlChildren(xml, "facts", "fact"),
    narrative: getXmlTag(xml, "narrative"),
    concepts: getXmlChildren(xml, "concepts", "concept"),
    files: getXmlChildren(xml, "files", "file"),
    importance: Math.max(
      1,
      Math.min(10, parseInt(getXmlTag(xml, "importance") || "5", 10) || 5),
    ),
  };
}

export function registerCompressFunction(
  sdk: ISdk,
  kv: StateKV,
  provider: MemoryProvider,
  metricsStore?: MetricsStore,
): void {
  sdk.registerFunction("mem::compress", 
    async (data: {
      observationId: string;
      sessionId: string;
      raw: RawObservation;
    }) => {
      const startMs = Date.now();

      let imageDescription: string | undefined;
      const hasImage = data.raw.modality === "image" || data.raw.modality === "mixed";

      if (hasImage && data.raw.imageData && provider.describeImage) {
        try {
          let base64Data = data.raw.imageData;
          let mimeType = "image/png";

          if (!data.raw.imageData.startsWith("/9j/") && !data.raw.imageData.startsWith("iVBOR")) {
            if (!isManagedImagePath(data.raw.imageData)) {
              throw new Error(`Refusing to read image outside managed store: ${data.raw.imageData}`);
            }
            const fileBuffer = readFileSync(data.raw.imageData);
            base64Data = fileBuffer.toString("base64");
            if (data.raw.imageData.endsWith(".jpg") || data.raw.imageData.endsWith(".jpeg")) mimeType = "image/jpeg";
            else if (data.raw.imageData.endsWith(".webp")) mimeType = "image/webp";
            else if (data.raw.imageData.endsWith(".gif")) mimeType = "image/gif";
          }

          imageDescription = await provider.describeImage(base64Data, mimeType, VISION_DESCRIPTION_PROMPT);
          logger.info("Image described by vision model", { obsId: data.observationId });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn("Vision model call failed, falling back to text-only compression", {
            obsId: data.observationId,
            error: msg,
          });
        }
      }

      const prompt = buildCompressionPrompt({
        hookType: data.raw.hookType,
        toolName: data.raw.toolName,
        toolInput: data.raw.toolInput,
        toolOutput: imageDescription
          ? `[Image Description]: ${imageDescription}\n\n${data.raw.toolOutput ?? ""}`
          : data.raw.toolOutput,
        userPrompt: data.raw.userPrompt,
        timestamp: data.raw.timestamp,
      });

      try {
        const validator = (response: string) => {
          const parsed = parseCompressionXml(response);
          if (!parsed) return { valid: false, errors: ["xml_parse_failed"] };
          const result = validateOutput(
            CompressOutputSchema,
            parsed,
            "mem::compress",
          );
          return result.valid
            ? { valid: true }
            : { valid: false, errors: result.result.errors };
        };

        const { response, retried } = await compressWithRetry(
          provider,
          COMPRESSION_SYSTEM,
          prompt,
          validator,
          1,
        );

        const parsed = parseCompressionXml(response);
        if (!parsed) {
          const latencyMs = Date.now() - startMs;
          if (metricsStore) {
            await metricsStore.record("mem::compress", latencyMs, false);
          }
          logger.warn("Failed to parse compression XML", {
            obsId: data.observationId,
            retried,
          });
          return { success: false, error: "parse_failed" };
        }

        const qualityScore = scoreCompression(parsed);

        const compressed: CompressedObservation = {
          id: data.observationId,
          sessionId: data.sessionId,
          timestamp: data.raw.timestamp,
          ...parsed,
          confidence: qualityScore / 100,
          ...(hasImage ? { modality: data.raw.modality } : {}),
          ...(imageDescription ? { imageDescription } : {}),
          ...(data.raw.imageData ? { imageRef: data.raw.imageData } : {}),
        };

        await kv.set(
          KV.observations(data.sessionId),
          data.observationId,
          compressed,
        );

        getSearchIndex().add(compressed);

        const streamResults = await Promise.allSettled([
          sdk.trigger({
            function_id: "stream::set",
            payload: {
              stream_name: STREAM.name,
              group_id: STREAM.group(data.sessionId),
              item_id: data.observationId,
              data: { type: "compressed", observation: compressed },
            },
          }),
          sdk.trigger({
            function_id: "stream::send",
            payload: {
              stream_name: STREAM.name,
              group_id: STREAM.viewerGroup,
              id: `compressed-${data.observationId}`,
              type: "compressed_observation",
              data: {
                type: "compressed",
                observation: compressed,
                sessionId: data.sessionId,
              },
            },
            action: TriggerAction.Void(),
          }),
        ]);
        for (const result of streamResults) {
          if (result.status === "rejected") {
            logger.warn("Non-fatal stream publish failure after compress", {
              sessionId: data.sessionId,
              observationId: data.observationId,
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
            });
          }
        }

        const latencyMs = Date.now() - startMs;
        if (metricsStore) {
          await metricsStore.record(
            "mem::compress",
            latencyMs,
            true,
            qualityScore,
          );
        }

        logger.info("Observation compressed", {
          obsId: data.observationId,
          type: compressed.type,
          importance: compressed.importance,
          qualityScore,
          retried,
        });

        return { success: true, compressed, qualityScore };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const latencyMs = Date.now() - startMs;
        if (metricsStore) {
          await metricsStore.record("mem::compress", latencyMs, false);
        }
        logger.error("Compression failed", {
          obsId: data.observationId,
          error: msg,
        });
        return { success: false, error: "compression_failed" };
      }
    },
  );
}
