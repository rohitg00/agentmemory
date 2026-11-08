import type { IIIClient } from "iii-sdk";
import { getBindings } from "./bindings.js";
import { compressMaxConcurrent, isAutoCompressEnabled, isGraphExtractionEnabled } from "../config.js";
import { isReflectEnabled } from "../functions/slots.js";

export function registerPipelineObservers(sdk: IIIClient): void {
  const bindings = getBindings(sdk);
  if (isAutoCompressEnabled()) {
    bindings.observePipeline(
      {
        function_id: "mem::observe",
        filters: { "output.observationId": { $exists: true }, "output.deduplicated": { $ne: true } },
        capture: ["output"],
        deliver: "output",
      },
      "mem::compress",
      { id: "agentmemory:pipeline:compress-on-capture", max_in_flight: compressMaxConcurrent() },
    );
  }
  const sessionFilters = { "output.unchanged": { $ne: true } };
  bindings.observePipeline(
    { function_id: "event::session::stopped", filters: sessionFilters, capture: ["input", "output"], deliver: "input" },
    "mem::post-session-graph",
    { id: "agentmemory:pipeline:post-session-graph", max_in_flight: 1 },
  );
  if (isReflectEnabled()) {
    bindings.observePipeline(
      { function_id: "event::session::stopped", filters: sessionFilters, capture: ["input", "output"], deliver: "input" },
      "mem::post-session-reflect",
      { id: "agentmemory:pipeline:post-session-reflect", max_in_flight: 1 },
    );
  }
  bindings.observePipeline(
    { function_id: "event::session::stopped", filters: { ...sessionFilters, "input.skipConsolidation": { $ne: true } }, capture: ["input", "output"], deliver: "input" },
    "mem::post-session-consolidate",
    { id: "agentmemory:pipeline:post-session-consolidate", max_in_flight: 1 },
  );
  if (isGraphExtractionEnabled()) {
    bindings.observePipeline(
      { function_id: "mem::remember", capture: ["input", "output"] },
      "mem::post-remember-graph",
      { id: "agentmemory:pipeline:post-remember-graph", max_in_flight: 1 },
    );
  }
}
