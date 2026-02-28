import type { ISdk, ApiRequest } from "iii-sdk";
import type { Session, CompressedObservation, HookPayload } from "../types.js";
import { KV } from "../state/schema.js";
import { StateKV } from "../state/kv.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getLatestHealth } from "../health/monitor.js";
import type { MetricsStore } from "../eval/metrics-store.js";
import type { ResilientProvider } from "../providers/resilient.js";

type Response = {
  status_code: number;
  headers?: Record<string, string>;
  body: unknown;
};

const VIEWER_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' ws://localhost:* wss://localhost:*; img-src 'self'; font-src 'self'";

function checkAuth(
  req: ApiRequest,
  secret: string | undefined,
): Response | null {
  if (!secret) return null;
  const auth = req.headers?.["authorization"] || req.headers?.["Authorization"];
  if (auth !== `Bearer ${secret}`) {
    return { status_code: 401, body: { error: "unauthorized" } };
  }
  return null;
}

export function registerApiTriggers(
  sdk: ISdk,
  kv: StateKV,
  secret?: string,
  metricsStore?: MetricsStore,
  provider?: ResilientProvider | { circuitState?: unknown },
): void {
  sdk.registerFunction(
    { id: "api::liveness" },
    async (): Promise<Response> => ({
      status_code: 200,
      body: { status: "ok", service: "agentmemory" },
    }),
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::liveness",
    config: { api_path: "/agentmemory/livez", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::health" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;

      const health = await getLatestHealth(kv);
      const functionMetrics = metricsStore ? await metricsStore.getAll() : [];
      const circuitBreaker =
        provider && "circuitState" in provider ? provider.circuitState : null;

      const status = health?.status || "healthy";
      const statusCode = status === "critical" ? 503 : 200;

      return {
        status_code: statusCode,
        body: {
          status,
          service: "agentmemory",
          version: "0.4.0",
          health: health || null,
          functionMetrics,
          circuitBreaker,
        },
      };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::health",
    config: { api_path: "/agentmemory/health", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::observe" },
    async (req: ApiRequest<HookPayload>): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const result = await sdk.trigger("mem::observe", req.body);
      return { status_code: 201, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::observe",
    config: { api_path: "/agentmemory/observe", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::context" },
    async (
      req: ApiRequest<{ sessionId: string; project: string; budget?: number }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const result = await sdk.trigger("mem::context", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::context",
    config: { api_path: "/agentmemory/context", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::search" },
    async (
      req: ApiRequest<{ query: string; limit?: number }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const result = await sdk.trigger("mem::search", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::search",
    config: { api_path: "/agentmemory/search", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::session::start" },
    async (
      req: ApiRequest<{ sessionId: string; project: string; cwd: string }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const { sessionId, project, cwd } = req.body;
      const session: Session = {
        id: sessionId,
        project,
        cwd,
        startedAt: new Date().toISOString(),
        status: "active",
        observationCount: 0,
      };
      await kv.set(KV.sessions, sessionId, session);
      const contextResult = await sdk.trigger<
        { sessionId: string; project: string },
        { context: string }
      >("mem::context", { sessionId, project });
      return {
        status_code: 200,
        body: { session, context: contextResult.context },
      };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::session::start",
    config: { api_path: "/agentmemory/session/start", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::session::end" },
    async (req: ApiRequest<{ sessionId: string }>): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const session = await kv.get<Session>(KV.sessions, req.body.sessionId);
      if (session) {
        await kv.set(KV.sessions, req.body.sessionId, {
          ...session,
          endedAt: new Date().toISOString(),
          status: "completed",
        });
      }
      return { status_code: 200, body: { success: true } };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::session::end",
    config: { api_path: "/agentmemory/session/end", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::summarize" },
    async (req: ApiRequest<{ sessionId: string }>): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const result = await sdk.trigger("mem::summarize", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::summarize",
    config: { api_path: "/agentmemory/summarize", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::sessions" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const sessions = await kv.list<Session>(KV.sessions);
      return { status_code: 200, body: { sessions } };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::sessions",
    config: { api_path: "/agentmemory/sessions", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::observations" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const sessionId = req.query_params["sessionId"] as string;
      if (!sessionId)
        return { status_code: 400, body: { error: "sessionId required" } };
      const observations = await kv.list<CompressedObservation>(
        KV.observations(sessionId),
      );
      return { status_code: 200, body: { observations } };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::observations",
    config: { api_path: "/agentmemory/observations", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::file-context" },
    async (
      req: ApiRequest<{ sessionId: string; files: string[] }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const result = await sdk.trigger("mem::file-context", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::file-context",
    config: { api_path: "/agentmemory/file-context", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::enrich" },
    async (
      req: ApiRequest<{
        sessionId: string;
        files: string[];
        terms?: string[];
        toolName?: string;
      }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (
        !req.body?.sessionId ||
        typeof req.body.sessionId !== "string" ||
        !Array.isArray(req.body?.files) ||
        req.body.files.length === 0 ||
        !req.body.files.every((f: unknown) => typeof f === "string")
      ) {
        return {
          status_code: 400,
          body: {
            error: "sessionId (string) and files (string[]) are required",
          },
        };
      }
      if (
        req.body.terms !== undefined &&
        (!Array.isArray(req.body.terms) ||
          !req.body.terms.every((t: unknown) => typeof t === "string"))
      ) {
        return {
          status_code: 400,
          body: { error: "terms must be an array of strings" },
        };
      }
      const result = await sdk.trigger("mem::enrich", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::enrich",
    config: { api_path: "/agentmemory/enrich", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::remember" },
    async (
      req: ApiRequest<{
        content: string;
        type?: string;
        concepts?: string[];
        files?: string[];
      }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (
        !req.body?.content ||
        typeof req.body.content !== "string" ||
        !req.body.content.trim()
      ) {
        return { status_code: 400, body: { error: "content is required" } };
      }
      const result = await sdk.trigger("mem::remember", req.body);
      return { status_code: 201, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::remember",
    config: { api_path: "/agentmemory/remember", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::forget" },
    async (
      req: ApiRequest<{
        sessionId?: string;
        observationIds?: string[];
        memoryId?: string;
      }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.sessionId && !req.body?.memoryId) {
        return {
          status_code: 400,
          body: { error: "sessionId or memoryId is required" },
        };
      }
      const result = await sdk.trigger("mem::forget", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::forget",
    config: { api_path: "/agentmemory/forget", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::consolidate" },
    async (
      req: ApiRequest<{ project?: string; minObservations?: number }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const result = await sdk.trigger("mem::consolidate", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::consolidate",
    config: { api_path: "/agentmemory/consolidate", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::patterns" },
    async (req: ApiRequest<{ project?: string }>): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const result = await sdk.trigger("mem::patterns", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::patterns",
    config: { api_path: "/agentmemory/patterns", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::generate-rules" },
    async (req: ApiRequest<{ project?: string }>): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const result = await sdk.trigger("mem::generate-rules", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::generate-rules",
    config: { api_path: "/agentmemory/generate-rules", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::migrate" },
    async (req: ApiRequest<{ dbPath: string }>): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.dbPath || typeof req.body.dbPath !== "string") {
        return { status_code: 400, body: { error: "dbPath is required" } };
      }
      const result = await sdk.trigger("mem::migrate", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::migrate",
    config: { api_path: "/agentmemory/migrate", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::evict" },
    async (req: ApiRequest<{ dryRun?: boolean }>): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const dryRun =
        req.query_params?.["dryRun"] === "true" || req.body?.dryRun === true;
      const result = await sdk.trigger("mem::evict", { dryRun });
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::evict",
    config: { api_path: "/agentmemory/evict", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::smart-search" },
    async (
      req: ApiRequest<{ query?: string; expandIds?: string[]; limit?: number }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (
        !req.body?.query &&
        (!req.body?.expandIds || req.body.expandIds.length === 0)
      ) {
        return {
          status_code: 400,
          body: { error: "query or expandIds is required" },
        };
      }
      const result = await sdk.trigger("mem::smart-search", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::smart-search",
    config: { api_path: "/agentmemory/smart-search", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::timeline" },
    async (
      req: ApiRequest<{
        anchor: string;
        project?: string;
        before?: number;
        after?: number;
      }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.anchor) {
        return { status_code: 400, body: { error: "anchor is required" } };
      }
      const result = await sdk.trigger("mem::timeline", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::timeline",
    config: { api_path: "/agentmemory/timeline", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::profile" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const project = req.query_params["project"] as string;
      if (!project) {
        return {
          status_code: 400,
          body: { error: "project query param is required" },
        };
      }
      const result = await sdk.trigger("mem::profile", { project });
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::profile",
    config: { api_path: "/agentmemory/profile", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::export" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const result = await sdk.trigger("mem::export", {});
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::export",
    config: { api_path: "/agentmemory/export", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::import" },
    async (
      req: ApiRequest<{
        exportData: unknown;
        strategy?: "merge" | "replace" | "skip";
      }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.exportData) {
        return { status_code: 400, body: { error: "exportData is required" } };
      }
      const result = await sdk.trigger("mem::import", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::import",
    config: { api_path: "/agentmemory/import", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::relations" },
    async (
      req: ApiRequest<{ sourceId: string; targetId: string; type: string }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.sourceId || !req.body?.targetId || !req.body?.type) {
        return {
          status_code: 400,
          body: { error: "sourceId, targetId, and type are required" },
        };
      }
      const result = await sdk.trigger("mem::relate", req.body);
      return { status_code: 201, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::relations",
    config: { api_path: "/agentmemory/relations", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::evolve" },
    async (
      req: ApiRequest<{
        memoryId: string;
        newContent: string;
        newTitle?: string;
      }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.memoryId || !req.body?.newContent) {
        return {
          status_code: 400,
          body: { error: "memoryId and newContent are required" },
        };
      }
      const result = await sdk.trigger("mem::evolve", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::evolve",
    config: { api_path: "/agentmemory/evolve", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::auto-forget" },
    async (req: ApiRequest<{ dryRun?: boolean }>): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const dryRun =
        req.query_params?.["dryRun"] === "true" || req.body?.dryRun === true;
      const result = await sdk.trigger("mem::auto-forget", { dryRun });
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::auto-forget",
    config: { api_path: "/agentmemory/auto-forget", http_method: "POST" },
  });

  sdk.registerFunction({ id: "api::viewer" }, async (): Promise<Response> => {
    const headers = {
      "Content-Type": "text/html",
      "Content-Security-Policy": VIEWER_CSP,
    };
    try {
      const viewerPath = join(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        "viewer",
        "index.html",
      );
      return {
        status_code: 200,
        headers,
        body: readFileSync(viewerPath, "utf-8"),
      };
    } catch {
      return {
        status_code: 200,
        headers,
        body: "<!DOCTYPE html><html><body><h1>agentmemory</h1></body></html>",
      };
    }
  });
  sdk.registerTrigger({
    type: "http",
    function_id: "api::viewer",
    config: { api_path: "/agentmemory/viewer", http_method: "GET" },
  });
}
