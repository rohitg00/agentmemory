import type { Capture, IIIClient } from "iii-sdk";
import { getBindings } from "./bindings.js";
import { KV } from "../state/schema.js";
import { compressMaxConcurrent, isAutoCompressEnabled, isGraphExtractionEnabled } from "../config.js";
import { isReflectEnabled } from "../functions/slots.js";

const FAILURE_OBSERVERS: Array<{ suffix: string; filters: Record<string, unknown>; capture: Capture[] }> = [
  { suffix: "error", filters: { error: { $exists: true } }, capture: ["input", "error"] },
  { suffix: "soft", filters: { "output.success": { $eq: false } }, capture: ["input", "output"] },
];

export function registerPipelineObservers(sdk: IIIClient): void {
  const bindings = getBindings(sdk);
  if (isAutoCompressEnabled()) {
    bindings.observePipeline(
      {
        function_id: "mem::observe",
        filters: { "output.observationId": { $exists: true }, "output.deduplicated": { $ne: true } },
        capture: ["output"],
      },
      "mem::compress",
      { id: "agentmemory:pipeline:compress-on-capture", max_in_flight: compressMaxConcurrent() },
    );
  }
  const sessionStopped = (filters: Record<string, unknown> = {}) => ({
    function_id: "event::session::stopped",
    filters: { "output.unchanged": { $ne: true }, ...filters },
    capture: ["input", "output"] as Capture[],
  });
  bindings.observePipeline(
    sessionStopped(),
    "mem::post-session-graph",
    { id: "agentmemory:pipeline:post-session-graph", max_in_flight: 1 },
  );
  if (isReflectEnabled()) {
    bindings.observePipeline(
      sessionStopped(),
      "mem::post-session-reflect",
      { id: "agentmemory:pipeline:post-session-reflect", max_in_flight: 1 },
    );
  }
  bindings.observePipeline(
    sessionStopped({ "input.skipConsolidation": { $ne: true } }),
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
  for (const fn of ["mem::compress", "mem::summarize", "mem::graph-extract", "mem::consolidate-pipeline", "mem::reflect", "mem::skill-extract"]) {
    for (const failure of FAILURE_OBSERVERS) {
      bindings.observePipeline(
        { function_id: fn, filters: failure.filters, capture: failure.capture },
        "mem::record-failure",
        { id: `agentmemory:pipeline:failure:${fn}:${failure.suffix}`, max_in_flight: 4, metadata: { source_fn: fn } },
      );
    }
  }
  bindings.observePipeline(
    { function_id: "mem::graph-extract", filters: { "output.partial": { $eq: true } }, capture: ["input", "output"] },
    "mem::record-failure",
    { id: "agentmemory:pipeline:failure:mem::graph-extract:partial", max_in_flight: 4, metadata: { source_fn: "mem::graph-extract" } },
  );
  bindings.observeStateChanges(
    {
      $or: [
        { "input.event_type": { $eq: "state:deleted" }, "input.scope": { $prefix: "mem:obs:" } },
        { "input.event_type": { $eq: "state:deleted" }, "input.scope": { $eq: KV.memories } },
        { "input.event_type": { $eq: "state:deleted" }, "input.scope": { $eq: KV.lessons } },
        { "input.scope": { $eq: KV.lessons }, "input.new_value.deleted": { $eq: true }, "input.old_value.deleted": { $ne: true } },
      ],
    },
    "mem::on-record-deleted",
    { id: "agentmemory:cascade:deleted", max_in_flight: 4 },
  );
  bindings.observeStateChanges(
    {
      $or: [
        { "input.event_type": { $eq: "state:created" }, "input.scope": { $eq: KV.relations }, "input.new_value.type": { $in: ["supersedes", "contradicts", "extends"] } },
        { "input.event_type": { $eq: "state:deleted" }, "input.scope": { $eq: KV.relations }, "input.old_value.type": { $in: ["supersedes", "contradicts", "extends"] } },
      ],
    },
    "event::graph::edge-reaction",
    { id: "agentmemory:cascade:relation-reaction", max_in_flight: 1 },
  );
}
