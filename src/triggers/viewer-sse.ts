import { http } from "@iii-dev/helpers/http";
import type { IIIClient } from "iii-sdk";
import { liveEvents, type LiveEventWriter } from "../viewer/live-events.js";

export function registerViewerSse(sdk: IIIClient): void {
  sdk.registerFunction(
    "api::viewer-events",
    http(async (_req, res) => {
      res.status(200);
      res.headers({
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      res.stream.write(": connected\n\n");
      liveEvents.subscribe(res.stream as LiveEventWriter);
    }),
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::viewer-events",
    config: {
      api_path: "/agentmemory/viewer/events",
      http_method: "GET",
      middleware_function_ids: ["middleware::api-auth"],
    },
  });
}
