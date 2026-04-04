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
import { VERSION } from "../version.js";
import { timingSafeCompare, VIEWER_CSP } from "../auth.js";

type Response = {
  status_code: number;
  headers?: Record<string, string>;
  body: unknown;
};

function checkAuth(
  req: ApiRequest,
  secret: string | undefined,
): Response | null {
  if (!secret) return null;
  const auth = req.headers?.["authorization"] || req.headers?.["Authorization"];
  if (
    typeof auth !== "string" ||
    !timingSafeCompare(auth, `Bearer ${secret}`)
  ) {
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
          version: VERSION,
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

  sdk.registerFunction(
    { id: "api::claude-bridge-read" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      try {
        const result = await sdk.trigger("mem::claude-bridge-read", {});
        return { status_code: 200, body: result };
      } catch {
        return {
          status_code: 404,
          body: { error: "Claude bridge not enabled" },
        };
      }
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::claude-bridge-read",
    config: { api_path: "/agentmemory/claude-bridge/read", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::claude-bridge-sync" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      try {
        const result = await sdk.trigger("mem::claude-bridge-sync", {});
        return { status_code: 200, body: result };
      } catch {
        return {
          status_code: 404,
          body: { error: "Claude bridge not enabled" },
        };
      }
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::claude-bridge-sync",
    config: {
      api_path: "/agentmemory/claude-bridge/sync",
      http_method: "POST",
    },
  });

  sdk.registerFunction(
    { id: "api::graph-query" },
    async (
      req: ApiRequest<{
        startNodeId?: string;
        nodeType?: string;
        maxDepth?: number;
        query?: string;
      }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      try {
        const result = await sdk.trigger("mem::graph-query", req.body || {});
        return { status_code: 200, body: result };
      } catch {
        return {
          status_code: 404,
          body: { error: "Knowledge graph not enabled" },
        };
      }
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::graph-query",
    config: { api_path: "/agentmemory/graph/query", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::graph-stats" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      try {
        const result = await sdk.trigger("mem::graph-stats", {});
        return { status_code: 200, body: result };
      } catch {
        return {
          status_code: 404,
          body: { error: "Knowledge graph not enabled" },
        };
      }
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::graph-stats",
    config: { api_path: "/agentmemory/graph/stats", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::graph-extract" },
    async (req: ApiRequest<{ observations: unknown[] }>): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (
        !Array.isArray(req.body?.observations) ||
        req.body.observations.length === 0
      ) {
        return {
          status_code: 400,
          body: { error: "observations array is required" },
        };
      }
      try {
        const result = await sdk.trigger("mem::graph-extract", req.body);
        return { status_code: 200, body: result };
      } catch {
        return {
          status_code: 404,
          body: { error: "Knowledge graph not enabled" },
        };
      }
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::graph-extract",
    config: { api_path: "/agentmemory/graph/extract", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::consolidate-pipeline" },
    async (req: ApiRequest<{ tier?: string }>): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      try {
        const result = await sdk.trigger(
          "mem::consolidate-pipeline",
          req.body || {},
        );
        return { status_code: 200, body: result };
      } catch {
        return {
          status_code: 404,
          body: { error: "Consolidation pipeline not enabled" },
        };
      }
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::consolidate-pipeline",
    config: {
      api_path: "/agentmemory/consolidate-pipeline",
      http_method: "POST",
    },
  });

  sdk.registerFunction(
    { id: "api::team-share" },
    async (
      req: ApiRequest<{ itemId: string; itemType: string; project?: string }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.itemId || !req.body?.itemType) {
        return {
          status_code: 400,
          body: { error: "itemId and itemType are required" },
        };
      }
      try {
        const result = await sdk.trigger("mem::team-share", req.body);
        return { status_code: 201, body: result };
      } catch {
        return { status_code: 404, body: { error: "Team memory not enabled" } };
      }
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::team-share",
    config: { api_path: "/agentmemory/team/share", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::team-feed" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      try {
        const limit = parseInt(req.query_params?.["limit"] as string) || 20;
        const result = await sdk.trigger("mem::team-feed", { limit });
        return { status_code: 200, body: result };
      } catch {
        return { status_code: 404, body: { error: "Team memory not enabled" } };
      }
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::team-feed",
    config: { api_path: "/agentmemory/team/feed", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::team-profile" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      try {
        const result = await sdk.trigger("mem::team-profile", {});
        return { status_code: 200, body: result };
      } catch {
        return { status_code: 404, body: { error: "Team memory not enabled" } };
      }
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::team-profile",
    config: { api_path: "/agentmemory/team/profile", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::audit" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const result = await sdk.trigger("mem::audit-query", {
        operation: req.query_params?.["operation"],
        limit: parseInt(req.query_params?.["limit"] as string) || 50,
      });
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::audit",
    config: { api_path: "/agentmemory/audit", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::governance-delete" },
    async (
      req: ApiRequest<{ memoryIds: string[]; reason?: string }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.memoryIds || !Array.isArray(req.body.memoryIds)) {
        return {
          status_code: 400,
          body: { error: "memoryIds array is required" },
        };
      }
      const result = await sdk.trigger("mem::governance-delete", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::governance-delete",
    config: {
      api_path: "/agentmemory/governance/memories",
      http_method: "DELETE",
    },
  });

  sdk.registerFunction(
    { id: "api::governance-bulk" },
    async (
      req: ApiRequest<{
        type?: string[];
        dateFrom?: string;
        dateTo?: string;
        qualityBelow?: number;
        dryRun?: boolean;
      }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const result = await sdk.trigger("mem::governance-bulk", req.body || {});
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::governance-bulk",
    config: {
      api_path: "/agentmemory/governance/bulk-delete",
      http_method: "POST",
    },
  });

  sdk.registerFunction(
    { id: "api::snapshots" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      try {
        const result = await sdk.trigger("mem::snapshot-list", {});
        return { status_code: 200, body: result };
      } catch {
        return { status_code: 404, body: { error: "Snapshots not enabled" } };
      }
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::snapshots",
    config: { api_path: "/agentmemory/snapshots", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::snapshot-create" },
    async (req: ApiRequest<{ message?: string }>): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      try {
        const result = await sdk.trigger(
          "mem::snapshot-create",
          req.body || {},
        );
        return { status_code: 201, body: result };
      } catch {
        return { status_code: 404, body: { error: "Snapshots not enabled" } };
      }
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::snapshot-create",
    config: { api_path: "/agentmemory/snapshot/create", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::snapshot-restore" },
    async (req: ApiRequest<{ commitHash: string }>): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.commitHash) {
        return { status_code: 400, body: { error: "commitHash is required" } };
      }
      try {
        const result = await sdk.trigger("mem::snapshot-restore", req.body);
        return { status_code: 200, body: result };
      } catch {
        return { status_code: 404, body: { error: "Snapshots not enabled" } };
      }
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::snapshot-restore",
    config: { api_path: "/agentmemory/snapshot/restore", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::memories" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const memories = await kv.list<import("../types.js").Memory>(KV.memories);
      const latest = req.query_params?.["latest"] === "true";
      const filtered = latest ? memories.filter((m) => m.isLatest) : memories;
      return { status_code: 200, body: { memories: filtered } };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::memories",
    config: { api_path: "/agentmemory/memories", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::action-create" },
    async (
      req: ApiRequest<{
        title: string;
        description?: string;
        priority?: number;
        createdBy?: string;
        project?: string;
        tags?: string[];
        parentId?: string;
        edges?: Array<{ type: string; targetActionId: string }>;
      }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.title) {
        return { status_code: 400, body: { error: "title is required" } };
      }
      const result = await sdk.trigger("mem::action-create", req.body);
      return { status_code: 201, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::action-create",
    config: { api_path: "/agentmemory/actions", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::action-update" },
    async (
      req: ApiRequest<{
        actionId: string;
        status?: string;
        title?: string;
        description?: string;
        priority?: number;
        result?: string;
      }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.actionId) {
        return { status_code: 400, body: { error: "actionId is required" } };
      }
      const result = await sdk.trigger("mem::action-update", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::action-update",
    config: { api_path: "/agentmemory/actions/update", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::action-list" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const result = await sdk.trigger("mem::action-list", {
        status: req.query_params?.["status"],
        project: req.query_params?.["project"],
        parentId: req.query_params?.["parentId"],
      });
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::action-list",
    config: { api_path: "/agentmemory/actions", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::action-get" },
    async (req: ApiRequest<{ actionId: string }>): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const actionId = req.query_params?.["actionId"] as string;
      if (!actionId) {
        return { status_code: 400, body: { error: "actionId required" } };
      }
      const result = await sdk.trigger("mem::action-get", { actionId });
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::action-get",
    config: { api_path: "/agentmemory/actions/get", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::action-edge" },
    async (
      req: ApiRequest<{
        sourceActionId: string;
        targetActionId: string;
        type: string;
      }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.sourceActionId || !req.body?.targetActionId || !req.body?.type) {
        return { status_code: 400, body: { error: "sourceActionId, targetActionId, and type are required" } };
      }
      const result = await sdk.trigger("mem::action-edge-create", req.body);
      return { status_code: 201, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::action-edge",
    config: { api_path: "/agentmemory/actions/edges", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::frontier" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const result = await sdk.trigger("mem::frontier", {
        project: req.query_params?.["project"],
        agentId: req.query_params?.["agentId"],
        limit: parseInt(req.query_params?.["limit"] as string) || undefined,
      });
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::frontier",
    config: { api_path: "/agentmemory/frontier", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::next" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const result = await sdk.trigger("mem::next", {
        project: req.query_params?.["project"],
        agentId: req.query_params?.["agentId"],
      });
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::next",
    config: { api_path: "/agentmemory/next", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::lease-acquire" },
    async (
      req: ApiRequest<{ actionId: string; agentId: string; ttlMs?: number }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.actionId || !req.body?.agentId) {
        return { status_code: 400, body: { error: "actionId and agentId are required" } };
      }
      const result = await sdk.trigger("mem::lease-acquire", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::lease-acquire",
    config: { api_path: "/agentmemory/leases/acquire", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::lease-release" },
    async (
      req: ApiRequest<{ actionId: string; agentId: string; result?: string }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.actionId || !req.body?.agentId) {
        return { status_code: 400, body: { error: "actionId and agentId are required" } };
      }
      const result = await sdk.trigger("mem::lease-release", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::lease-release",
    config: { api_path: "/agentmemory/leases/release", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::lease-renew" },
    async (
      req: ApiRequest<{ actionId: string; agentId: string; ttlMs?: number }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.actionId || !req.body?.agentId) {
        return { status_code: 400, body: { error: "actionId and agentId are required" } };
      }
      const result = await sdk.trigger("mem::lease-renew", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::lease-renew",
    config: { api_path: "/agentmemory/leases/renew", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::routine-create" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.name) {
        return { status_code: 400, body: { error: "name is required" } };
      }
      const result = await sdk.trigger("mem::routine-create", req.body);
      return { status_code: 201, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::routine-create",
    config: { api_path: "/agentmemory/routines", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::routine-list" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const result = await sdk.trigger("mem::routine-list", {
        frozen: req.query_params?.["frozen"] === "true" ? true : undefined,
      });
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::routine-list",
    config: { api_path: "/agentmemory/routines", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::routine-run" },
    async (
      req: ApiRequest<{ routineId: string; project?: string; initiatedBy?: string }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.routineId) {
        return { status_code: 400, body: { error: "routineId is required" } };
      }
      const result = await sdk.trigger("mem::routine-run", req.body);
      return { status_code: 201, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::routine-run",
    config: { api_path: "/agentmemory/routines/run", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::routine-status" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const runId = req.query_params?.["runId"] as string;
      if (!runId) {
        return { status_code: 400, body: { error: "runId query param required" } };
      }
      const result = await sdk.trigger("mem::routine-status", { runId });
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::routine-status",
    config: { api_path: "/agentmemory/routines/status", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::signal-send" },
    async (
      req: ApiRequest<{
        from: string;
        to?: string;
        content: string;
        type?: string;
        replyTo?: string;
      }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.from || !req.body?.content) {
        return { status_code: 400, body: { error: "from and content are required" } };
      }
      const result = await sdk.trigger("mem::signal-send", req.body);
      return { status_code: 201, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::signal-send",
    config: { api_path: "/agentmemory/signals/send", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::signal-read" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const agentId = req.query_params?.["agentId"] as string;
      if (!agentId) {
        return { status_code: 400, body: { error: "agentId query param required" } };
      }
      const result = await sdk.trigger("mem::signal-read", {
        agentId,
        unreadOnly: req.query_params?.["unreadOnly"] === "true",
        threadId: req.query_params?.["threadId"],
        limit: parseInt(req.query_params?.["limit"] as string) || undefined,
      });
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::signal-read",
    config: { api_path: "/agentmemory/signals", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::checkpoint-create" },
    async (
      req: ApiRequest<{
        name: string;
        description?: string;
        type?: string;
        linkedActionIds?: string[];
        expiresInMs?: number;
      }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.name) {
        return { status_code: 400, body: { error: "name is required" } };
      }
      const result = await sdk.trigger("mem::checkpoint-create", req.body);
      return { status_code: 201, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::checkpoint-create",
    config: { api_path: "/agentmemory/checkpoints", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::checkpoint-resolve" },
    async (
      req: ApiRequest<{
        checkpointId: string;
        status: string;
        resolvedBy?: string;
        result?: unknown;
      }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.checkpointId || !req.body?.status) {
        return { status_code: 400, body: { error: "checkpointId and status are required" } };
      }
      const result = await sdk.trigger("mem::checkpoint-resolve", req.body);
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::checkpoint-resolve",
    config: { api_path: "/agentmemory/checkpoints/resolve", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::checkpoint-list" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const result = await sdk.trigger("mem::checkpoint-list", {
        status: req.query_params?.["status"],
        type: req.query_params?.["type"],
      });
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::checkpoint-list",
    config: { api_path: "/agentmemory/checkpoints", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::mesh-register" },
    async (
      req: ApiRequest<{ url: string; name: string; sharedScopes?: string[] }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      if (!req.body?.url || !req.body?.name) {
        return { status_code: 400, body: { error: "url and name are required" } };
      }
      const result = await sdk.trigger("mem::mesh-register", req.body);
      return { status_code: 201, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::mesh-register",
    config: { api_path: "/agentmemory/mesh/peers", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::mesh-list" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const result = await sdk.trigger("mem::mesh-list", {});
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::mesh-list",
    config: { api_path: "/agentmemory/mesh/peers", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::mesh-sync" },
    async (
      req: ApiRequest<{ peerId?: string; direction?: string }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const result = await sdk.trigger("mem::mesh-sync", req.body || {});
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::mesh-sync",
    config: { api_path: "/agentmemory/mesh/sync", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::mesh-receive" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const result = await sdk.trigger("mem::mesh-receive", req.body || {});
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::mesh-receive",
    config: { api_path: "/agentmemory/mesh/receive", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::mesh-export" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const since = req.query_params?.["since"] as string;
      if (since) {
        const parsed = new Date(since).getTime();
        if (Number.isNaN(parsed)) {
          return { status_code: 400, body: { error: "Invalid 'since' date format" } };
        }
      }
      const project = req.query_params?.["project"] as string | undefined;
      const sinceTime = since ? new Date(since).getTime() : 0;
      const df = <T>(items: T[], field: "updatedAt" | "createdAt") =>
        items.filter((i) => new Date((i as Record<string, unknown>)[field] as string).getTime() > sinceTime);
      const memories = await kv.list<import("../types.js").Memory>(KV.memories);
      let actions = await kv.list<import("../types.js").Action>(KV.actions);
      if (project) {
        actions = actions.filter((a) => a.project === project);
      }
      const body: Record<string, unknown> = {
        memories: df(memories, "updatedAt"),
        actions: df(actions, "updatedAt"),
      };
      if (!project) {
        const semantic = await kv.list<import("../types.js").SemanticMemory>(KV.semantic);
        const procedural = await kv.list<import("../types.js").ProceduralMemory>(KV.procedural);
        const relations = await kv.list<import("../types.js").MemoryRelation>(KV.relations);
        const graphNodes = await kv.list<import("../types.js").GraphNode>(KV.graphNodes);
        const graphEdges = await kv.list<import("../types.js").GraphEdge>(KV.graphEdges);
        body.semantic = df(semantic, "updatedAt");
        body.procedural = df(procedural, "updatedAt");
        body.relations = df(relations, "createdAt");
        body.graphNodes = graphNodes.filter(
          (n) => new Date(n.updatedAt || n.createdAt).getTime() > sinceTime,
        );
        body.graphEdges = df(graphEdges, "createdAt");
      }
      return { status_code: 200, body };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::mesh-export",
    config: { api_path: "/agentmemory/mesh/export", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::flow-compress" },
    async (
      req: ApiRequest<{
        runId?: string;
        actionIds?: string[];
        project?: string;
      }>,
    ): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      try {
        const result = await sdk.trigger("mem::flow-compress", req.body || {});
        return { status_code: 200, body: result };
      } catch {
        return {
          status_code: 404,
          body: { error: "Flow compression requires a provider" },
        };
      }
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::flow-compress",
    config: { api_path: "/agentmemory/flow/compress", http_method: "POST" },
  });

  sdk.registerFunction(
    { id: "api::branch-detect" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const cwd = (req.query_params?.["cwd"] as string) || process.cwd();
      const result = await sdk.trigger("mem::detect-worktree", { cwd });
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::branch-detect",
    config: { api_path: "/agentmemory/branch/detect", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::branch-worktrees" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const cwd = (req.query_params?.["cwd"] as string) || process.cwd();
      const result = await sdk.trigger("mem::list-worktrees", { cwd });
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::branch-worktrees",
    config: { api_path: "/agentmemory/branch/worktrees", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "api::branch-sessions" },
    async (req: ApiRequest): Promise<Response> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      const cwd = (req.query_params?.["cwd"] as string) || process.cwd();
      const result = await sdk.trigger("mem::branch-sessions", { cwd });
      return { status_code: 200, body: result };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "api::branch-sessions",
    config: { api_path: "/agentmemory/branch/sessions", http_method: "GET" },
  });

  sdk.registerFunction({ id: "api::viewer" }, async (): Promise<Response> => {
    const headers = {
      "Content-Type": "text/html",
      "Content-Security-Policy": VIEWER_CSP,
    };
    const base = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(base, "..", "viewer", "index.html"),
      join(base, "..", "src", "viewer", "index.html"),
      join(base, "viewer", "index.html"),
    ];
    for (const p of candidates) {
      try {
        const html = readFileSync(p, "utf-8");
        return { status_code: 200, headers, body: html };
      } catch {}
    }
    return {
      status_code: 404,
      headers,
      body: "<!DOCTYPE html><html><body><h1>agentmemory</h1><p>viewer not found</p></body></html>",
    };
  });
  sdk.registerTrigger({
    type: "http",
    function_id: "api::viewer",
    config: { api_path: "/agentmemory/viewer", http_method: "GET" },
  });

  sdk.registerFunction({ id: "api::sentinel-create" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = req.body as Record<string, unknown>;
    if (!body?.name) return { status_code: 400, body: { error: "name is required" } };
    const result = await sdk.trigger("mem::sentinel-create", body);
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::sentinel-create", config: { api_path: "/agentmemory/sentinels", http_method: "POST" } });

  sdk.registerFunction({ id: "api::sentinel-trigger" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = req.body as Record<string, unknown>;
    if (!body?.sentinelId) return { status_code: 400, body: { error: "sentinelId is required" } };
    const result = await sdk.trigger("mem::sentinel-trigger", body);
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::sentinel-trigger", config: { api_path: "/agentmemory/sentinels/trigger", http_method: "POST" } });

  sdk.registerFunction({ id: "api::sentinel-check" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const result = await sdk.trigger("mem::sentinel-check", {});
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::sentinel-check", config: { api_path: "/agentmemory/sentinels/check", http_method: "POST" } });

  sdk.registerFunction({ id: "api::sentinel-cancel" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = req.body as Record<string, unknown>;
    if (!body?.sentinelId) return { status_code: 400, body: { error: "sentinelId is required" } };
    const result = await sdk.trigger("mem::sentinel-cancel", body);
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::sentinel-cancel", config: { api_path: "/agentmemory/sentinels/cancel", http_method: "POST" } });

  sdk.registerFunction({ id: "api::sentinel-list" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const params = req.query_params || {};
    const result = await sdk.trigger("mem::sentinel-list", { status: params.status, type: params.type });
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::sentinel-list", config: { api_path: "/agentmemory/sentinels", http_method: "GET" } });

  sdk.registerFunction({ id: "api::sketch-create" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = req.body as Record<string, unknown>;
    if (!body?.title) return { status_code: 400, body: { error: "title is required" } };
    const result = await sdk.trigger("mem::sketch-create", body);
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::sketch-create", config: { api_path: "/agentmemory/sketches", http_method: "POST" } });

  sdk.registerFunction({ id: "api::sketch-add" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = req.body as Record<string, unknown>;
    if (!body?.sketchId || !body?.title) return { status_code: 400, body: { error: "sketchId and title are required" } };
    const result = await sdk.trigger("mem::sketch-add", body);
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::sketch-add", config: { api_path: "/agentmemory/sketches/add", http_method: "POST" } });

  sdk.registerFunction({ id: "api::sketch-promote" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = req.body as Record<string, unknown>;
    if (!body?.sketchId) return { status_code: 400, body: { error: "sketchId is required" } };
    const result = await sdk.trigger("mem::sketch-promote", body);
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::sketch-promote", config: { api_path: "/agentmemory/sketches/promote", http_method: "POST" } });

  sdk.registerFunction({ id: "api::sketch-discard" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = req.body as Record<string, unknown>;
    if (!body?.sketchId) return { status_code: 400, body: { error: "sketchId is required" } };
    const result = await sdk.trigger("mem::sketch-discard", body);
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::sketch-discard", config: { api_path: "/agentmemory/sketches/discard", http_method: "POST" } });

  sdk.registerFunction({ id: "api::sketch-list" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const params = req.query_params || {};
    const result = await sdk.trigger("mem::sketch-list", { status: params.status, project: params.project });
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::sketch-list", config: { api_path: "/agentmemory/sketches", http_method: "GET" } });

  sdk.registerFunction({ id: "api::sketch-gc" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const result = await sdk.trigger("mem::sketch-gc", {});
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::sketch-gc", config: { api_path: "/agentmemory/sketches/gc", http_method: "POST" } });

  sdk.registerFunction({ id: "api::crystallize" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = req.body as Record<string, unknown>;
    if (!body?.actionIds) return { status_code: 400, body: { error: "actionIds is required" } };
    const result = await sdk.trigger("mem::crystallize", body);
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::crystallize", config: { api_path: "/agentmemory/crystals/create", http_method: "POST" } });

  sdk.registerFunction({ id: "api::crystal-list" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const params = req.query_params || {};
    const result = await sdk.trigger("mem::crystal-list", { project: params.project, sessionId: params.sessionId, limit: params.limit ? parseInt(params.limit as string) : undefined });
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::crystal-list", config: { api_path: "/agentmemory/crystals", http_method: "GET" } });

  sdk.registerFunction({ id: "api::auto-crystallize" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = req.body as Record<string, unknown>;
    const result = await sdk.trigger("mem::auto-crystallize", body || {});
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::auto-crystallize", config: { api_path: "/agentmemory/crystals/auto", http_method: "POST" } });

  sdk.registerFunction({ id: "api::diagnose" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = req.body as Record<string, unknown>;
    const result = await sdk.trigger("mem::diagnose", body || {});
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::diagnose", config: { api_path: "/agentmemory/diagnostics", http_method: "POST" } });

  sdk.registerFunction({ id: "api::heal" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = req.body as Record<string, unknown>;
    const result = await sdk.trigger("mem::heal", body || {});
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::heal", config: { api_path: "/agentmemory/diagnostics/heal", http_method: "POST" } });

  sdk.registerFunction({ id: "api::facet-tag" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = req.body as Record<string, unknown>;
    if (!body?.targetId || !body?.dimension || !body?.value) return { status_code: 400, body: { error: "targetId, dimension, and value are required" } };
    const result = await sdk.trigger("mem::facet-tag", body);
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::facet-tag", config: { api_path: "/agentmemory/facets", http_method: "POST" } });

  sdk.registerFunction({ id: "api::facet-untag" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = req.body as Record<string, unknown>;
    if (!body?.targetId || !body?.dimension) return { status_code: 400, body: { error: "targetId and dimension are required" } };
    const result = await sdk.trigger("mem::facet-untag", body);
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::facet-untag", config: { api_path: "/agentmemory/facets/remove", http_method: "POST" } });

  sdk.registerFunction({ id: "api::facet-query" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = req.body as Record<string, unknown>;
    const result = await sdk.trigger("mem::facet-query", body || {});
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::facet-query", config: { api_path: "/agentmemory/facets/query", http_method: "POST" } });

  sdk.registerFunction({ id: "api::facet-get" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const params = req.query_params || {};
    if (!params.targetId) return { status_code: 400, body: { error: "targetId query param is required" } };
    const result = await sdk.trigger("mem::facet-get", { targetId: params.targetId });
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::facet-get", config: { api_path: "/agentmemory/facets", http_method: "GET" } });

  sdk.registerFunction({ id: "api::facet-stats" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const params = req.query_params || {};
    const result = await sdk.trigger("mem::facet-stats", { targetType: params.targetType });
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::facet-stats", config: { api_path: "/agentmemory/facets/stats", http_method: "GET" } });

  sdk.registerFunction({ id: "api::verify" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = req.body as Record<string, unknown>;
    if (!body?.id || typeof body.id !== "string") return { status_code: 400, body: { error: "id is required" } };
    const result = await sdk.trigger("mem::verify", { id: body.id });
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::verify", config: { api_path: "/agentmemory/verify", http_method: "POST" } });

  sdk.registerFunction({ id: "api::cascade-update" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = req.body as Record<string, unknown>;
    if (!body?.supersededMemoryId || typeof body.supersededMemoryId !== "string") {
      return { status_code: 400, body: { error: "supersededMemoryId is required" } };
    }
    const result = await sdk.trigger("mem::cascade-update", { supersededMemoryId: body.supersededMemoryId });
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::cascade-update", config: { api_path: "/agentmemory/cascade-update", http_method: "POST" } });

  sdk.registerFunction({ id: "api::lesson-save" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = req.body as Record<string, unknown>;
    if (!body?.content || typeof body.content !== "string") return { status_code: 400, body: { error: "content is required" } };
    const tags = typeof body.tags === "string" ? (body.tags as string).split(",").map((t: string) => t.trim()).filter(Boolean) : Array.isArray(body.tags) ? body.tags : [];
    const result = await sdk.trigger("mem::lesson-save", {
      content: body.content,
      context: body.context || "",
      confidence: typeof body.confidence === "number" ? body.confidence : undefined,
      project: typeof body.project === "string" ? body.project : undefined,
      tags,
      source: "manual",
    }) as { action?: string };
    const statusCode = result?.action === "created" ? 201 : 200;
    return { status_code: statusCode, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::lesson-save", config: { api_path: "/agentmemory/lessons", http_method: "POST" } });

  sdk.registerFunction({ id: "api::lesson-list" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const params = req.query_params || {};
    const result = await sdk.trigger("mem::lesson-list", {
      project: params.project,
      source: params.source,
      minConfidence: params.minConfidence ? parseFloat(params.minConfidence as string) : undefined,
      limit: params.limit ? parseInt(params.limit as string, 10) : undefined,
    });
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::lesson-list", config: { api_path: "/agentmemory/lessons", http_method: "GET" } });

  sdk.registerFunction({ id: "api::lesson-search" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = req.body as Record<string, unknown>;
    if (!body?.query || typeof body.query !== "string") return { status_code: 400, body: { error: "query is required" } };
    const result = await sdk.trigger("mem::lesson-recall", body);
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::lesson-search", config: { api_path: "/agentmemory/lessons/search", http_method: "POST" } });

  sdk.registerFunction({ id: "api::lesson-strengthen" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = req.body as Record<string, unknown>;
    if (!body?.lessonId || typeof body.lessonId !== "string") return { status_code: 400, body: { error: "lessonId is required" } };
    const result = await sdk.trigger("mem::lesson-strengthen", { lessonId: body.lessonId });
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::lesson-strengthen", config: { api_path: "/agentmemory/lessons/strengthen", http_method: "POST" } });

  sdk.registerFunction({ id: "api::obsidian-export" }, async (req: ApiRequest) => {
    const denied = checkAuth(req, secret);
    if (denied) return denied;
    const body = (req.body as Record<string, unknown>) || {};
    const types = typeof body.types === "string" ? body.types.split(",").map((t: string) => t.trim()).filter(Boolean) : undefined;
    const result = await sdk.trigger("mem::obsidian-export", { vaultDir: body.vaultDir, types });
    return { status_code: 200, body: result };
  });
  sdk.registerTrigger({ type: "http", function_id: "api::obsidian-export", config: { api_path: "/agentmemory/obsidian/export", http_method: "POST" } });
}
