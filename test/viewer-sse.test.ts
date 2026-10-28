import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { registerViewerSse } from "../src/triggers/viewer-sse.js";

const viewerSource = readFileSync("src/viewer/index.html", "utf8");
function extractFunction(name: string): string {
  const start = viewerSource.indexOf(`function ${name}(`);
  let depth = 0;
  for (let i = viewerSource.indexOf("{", start); i < viewerSource.length; i++) {
    if (viewerSource[i] === "{") depth++;
    if (viewerSource[i] === "}" && --depth === 0) return viewerSource.slice(start, i + 1);
  }
  throw new Error(`unbalanced ${name}`);
}

describe("viewer SSE endpoint", () => {
  it("registers the authenticated GET route and streams with the required headers", async () => {
    const functions = new Map<string, (req: any) => Promise<any>>();
    const triggers: any[] = [];
    const sdk = { registerFunction: (id: string, fn: any) => functions.set(id, fn), registerTrigger: (trigger: any) => triggers.push(trigger) };
    registerViewerSse(sdk as never);
    expect(triggers).toContainEqual(expect.objectContaining({
      type: "http", function_id: "api::viewer-events",
      config: expect.objectContaining({ api_path: "/agentmemory/viewer/events", http_method: "GET", middleware_function_ids: ["middleware::api-auth"] }),
    }));
    const parts: string[] = [];
    const emitted: any[] = [];
    const response = { sendMessage: (raw: string) => { const message = JSON.parse(raw); emitted.push(message.type === "set_status" ? ["status", message.status_code] : ["headers", message.headers]); }, stream: { write: (s: string) => parts.push(s), once(event: string, cb: () => void) { if (event === "close") queueMicrotask(cb); }, off() {}, writableLength: 0, destroyed: false }, close() {} };
    const handler = functions.get("api::viewer-events")!;
    await handler({ headers: {}, path_params: {}, query_params: {}, body: null, method: "GET", request_body: {}, response } as any);
    expect(emitted).toEqual([["status", 200], ["headers", expect.objectContaining({ "content-type": "text/event-stream", "cache-control": "no-cache" })]]);
    expect(parts).toEqual([": connected\n\n"]);
  });

  it("contains a parser that joins fragmented SSE frames and uses bearer auth", () => {
    const html = readFileSync("src/viewer/index.html", "utf8");
    expect(html).toContain("function consumeSseChunk(buffer, chunk)");
    const consume = new Function(`${extractFunction("parseSseFrame")}\n${extractFunction("consumeSseChunk")}\nreturn consumeSseChunk;`)();
    let result = consume("", "id: e1\nevent: memory.created\ndata: {\"id\":\"e1\",\"type\":\"memory.created\",\"data\":{}");
    expect(result.frames).toEqual([]);
    result = consume(result.buffer, "}\n\n");
    expect(result.frames).toEqual([{ id: "e1", type: "memory.created", data: { id: "e1", type: "memory.created", data: {} } }]);
    expect(html).toContain("headers.Authorization = 'Bearer ' + viewerToken");
    expect(html).toContain("function loadRecentObservations()");
    expect(html).not.toMatch(/new WebSocket|wsPort|III_STREAM_PORT|stream\/mem-live/);
  });
});
