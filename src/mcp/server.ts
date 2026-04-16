import type { ISdk, ApiRequest } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";
import type {
  SessionSummary,
  Memory,
  Session,
  GraphNode,
  GraphEdge,
} from "../types.js";
import { getVisibleTools } from "./tools-registry.js";
import { timingSafeCompare } from "../auth.js";

type McpResponse = {
  status_code: number;
  headers?: Record<string, string>;
  body: unknown;
};

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown, fallback?: number): number | undefined {
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  return fallback;
}

function parseCsvList(value: unknown): string[] {
  if (typeof value === "string") {
    return value.split(",").map((v) => v.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
  }
  return [];
}

export function registerMcpEndpoints(
  sdk: ISdk,
  kv: StateKV,
  secret?: string,
): void {
  function checkAuth(
    req: ApiRequest,
    sec: string | undefined,
  ): McpResponse | null {
    if (!sec) return null;
    const auth =
      req.headers?.["authorization"] || req.headers?.["Authorization"];
    if (typeof auth !== "string" || !timingSafeCompare(auth, `Bearer ${sec}`)) {
      return { status_code: 401, body: { error: "unauthorized" } };
    }
    return null;
  }

  sdk.registerFunction("mcp::tools::list", 
    async (req: ApiRequest): Promise<McpResponse> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      return { status_code: 200, body: { tools: getVisibleTools() } };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "mcp::tools::list",
    config: { api_path: "/agentmemory/mcp/tools", http_method: "GET" },
  });

  sdk.registerFunction("mcp::tools::call", 
    async (
      req: ApiRequest<{ name: string; arguments: Record<string, unknown> }>,
    ): Promise<McpResponse> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;

      if (!req.body || typeof req.body.name !== "string") {
        return { status_code: 400, body: { error: "name is required" } };
      }

      const { name, arguments: args = {} } = req.body;

      try {
        switch (name) {
          case "memory_recall": {
            if (typeof args.query !== "string" || !args.query.trim()) {
              return {
                status_code: 400,
                body: { error: "query is required for memory_recall" },
              };
            }
            const format =
              typeof args.format === "string" ? args.format.trim().toLowerCase() : "full";
            if (!["full", "compact", "narrative"].includes(format)) {
              return {
                status_code: 400,
                body: {
                  error: "format must be one of: full, compact, narrative",
                },
              };
            }
            const tokenBudget = asNumber(args.token_budget);
            if (
              args.token_budget !== undefined &&
              (!Number.isInteger(tokenBudget) || (tokenBudget ?? 0) < 1)
            ) {
              return {
                status_code: 400,
                body: { error: "token_budget must be a positive integer" },
              };
            }
            const result = await sdk.trigger({ function_id: "mem::search", payload: {
              query: args.query,
              limit: typeof args.limit === "number" ? args.limit : 10,
              format,
              token_budget: tokenBudget,
            } });
            const text =
              format === "narrative" &&
              result &&
              typeof result === "object" &&
              "text" in (result as Record<string, unknown>) &&
              typeof (result as { text?: unknown }).text === "string"
                ? (result as { text: string }).text
                : JSON.stringify(result, null, 2);
            return {
              status_code: 200,
              body: {
                content: [
                  { type: "text", text },
                ],
              },
            };
          }

          case "memory_compress_file": {
            if (typeof args.filePath !== "string" || !args.filePath.trim()) {
              return {
                status_code: 400,
                body: { error: "filePath is required for memory_compress_file" },
              };
            }
            const result = await sdk.trigger({
              function_id: "mem::compress-file",
              payload: { filePath: args.filePath.trim() },
            });
            return {
              status_code: 200,
              body: {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
              },
            };
          }

          case "memory_save": {
            if (typeof args.content !== "string" || !args.content.trim()) {
              return {
                status_code: 400,
                body: { error: "content is required for memory_save" },
              };
            }
            const type = (args.type as string) || "fact";
            const concepts =
              typeof args.concepts === "string"
                ? args.concepts.split(",").map((c: string) => c.trim()).filter(Boolean)
                : [];
            const files =
              typeof args.files === "string"
                ? args.files.split(",").map((f: string) => f.trim()).filter(Boolean)
                : [];

            const result = await sdk.trigger({ function_id: "mem::remember", payload: {
              content: args.content,
              type,
              concepts,
              files,
            } });
            return {
              status_code: 200,
              body: {
                content: [{ type: "text", text: JSON.stringify(result) }],
              },
            };
          }

          case "memory_file_history": {
            if (typeof args.files !== "string" || !args.files.trim()) {
              return {
                status_code: 400,
                body: { error: "files is required for memory_file_history" },
              };
            }
            const fileList = parseCsvList(args.files);
            if (!fileList.length) {
              return {
                status_code: 400,
                body: { error: "files must contain at least one valid path" },
              };
            }
            const payload: { sessionId?: string; files: string[] } = { files: fileList };
            const sessionId = asNonEmptyString(args.sessionId);
            if (sessionId) payload.sessionId = sessionId;
            const result = await sdk.trigger({
              function_id: "mem::file-context",
              payload,
            });
            return {
              status_code: 200,
              body: {
                content: [
                  {
                    type: "text",
                    text:
                      (result as { context: string }).context ||
                      "No history found.",
                  },
                ],
              },
            };
          }

          case "memory_patterns": {
            const result = await sdk.trigger({ function_id: "mem::patterns", payload: {
              project: args.project as string,
            } });
            return {
              status_code: 200,
              body: {
                content: [
                  { type: "text", text: JSON.stringify(result, null, 2) },
                ],
              },
            };
          }

          case "memory_sessions": {
            const sessions = await kv.list(KV.sessions);
            return {
              status_code: 200,
              body: {
                content: [
                  { type: "text", text: JSON.stringify({ sessions }, null, 2) },
                ],
              },
            };
          }

          case "memory_smart_search": {
            if (typeof args.query !== "string" || !args.query.trim()) {
              return {
                status_code: 400,
                body: { error: "query is required for memory_smart_search" },
              };
            }
            const expandIds = parseCsvList(args.expandIds).slice(0, 20);
            const limit = Math.max(1, Math.min(100, asNumber(args.limit, 10) ?? 10));
            const result = await sdk.trigger({
              function_id: "mem::smart-search",
              payload: {
                query: args.query,
                expandIds,
                limit,
              },
            });
            return {
              status_code: 200,
              body: {
                content: [
                  { type: "text", text: JSON.stringify(result, null, 2) },
                ],
              },
            };
          }

          case "memory_timeline": {
            if (typeof args.anchor !== "string" || !args.anchor.trim()) {
              return {
                status_code: 400,
                body: { error: "anchor is required for memory_timeline" },
              };
            }
            const result = await sdk.trigger({ function_id: "mem::timeline", payload: {
              anchor: args.anchor,
              project: (args.project as string) || undefined,
              before: (args.before as number) || 5,
              after: (args.after as number) || 5,
            } });
            return {
              status_code: 200,
              body: {
                content: [
                  { type: "text", text: JSON.stringify(result, null, 2) },
                ],
              },
            };
          }

          case "memory_profile": {
            if (typeof args.project !== "string" || !args.project.trim()) {
              return {
                status_code: 400,
                body: { error: "project is required for memory_profile" },
              };
            }
            const result = await sdk.trigger({ function_id: "mem::profile", payload: {
              project: args.project,
              refresh: args.refresh === true || args.refresh === "true",
            } });
            return {
              status_code: 200,
              body: {
                content: [
                  { type: "text", text: JSON.stringify(result, null, 2) },
                ],
              },
            };
          }

          case "memory_export": {
            const result = await sdk.trigger({ function_id: "mem::export", payload: {} });
            return {
              status_code: 200,
              body: {
                content: [
                  { type: "text", text: JSON.stringify(result, null, 2) },
                ],
              },
            };
          }

          case "memory_relations": {
            if (typeof args.memoryId !== "string" || !args.memoryId.trim()) {
              return {
                status_code: 400,
                body: { error: "memoryId is required for memory_relations" },
              };
            }
            const rawMaxHops = Number(args.maxHops);
            const rawMinConf = Number(args.minConfidence);
            const result = await sdk.trigger({ function_id: "mem::get-related", payload: {
              memoryId: args.memoryId,
              maxHops: Number.isFinite(rawMaxHops) ? rawMaxHops : 2,
              minConfidence: Number.isFinite(rawMinConf)
                ? Math.max(0, Math.min(1, rawMinConf))
                : 0,
            } });
            return {
              status_code: 200,
              body: {
                content: [
                  { type: "text", text: JSON.stringify(result, null, 2) },
                ],
              },
            };
          }

          case "memory_claude_bridge_sync": {
            const direction = (args.direction as string) || "write";
            const funcId =
              direction === "read"
                ? "mem::claude-bridge-read"
                : "mem::claude-bridge-sync";
            try {
              const result = await sdk.trigger({
                function_id: funcId,
                payload: {},
              });
              return {
                status_code: 200,
                body: {
                  content: [
                    { type: "text", text: JSON.stringify(result, null, 2) },
                  ],
                },
              };
            } catch {
              return {
                status_code: 200,
                body: {
                  content: [
                    {
                      type: "text",
                      text: "Claude bridge not enabled. Set CLAUDE_MEMORY_BRIDGE=true",
                    },
                  ],
                },
              };
            }
          }

          case "memory_graph_query": {
            try {
              const payload: {
                startNodeId?: string;
                nodeType?: string;
                maxDepth?: number;
                query?: string;
              } = {};
              const startNodeId = asNonEmptyString(args.startNodeId);
              const nodeType = asNonEmptyString(args.nodeType);
              const query = asNonEmptyString(args.query);
              const maxDepth = asNumber(args.maxDepth);
              if (startNodeId) payload.startNodeId = startNodeId;
              if (nodeType) payload.nodeType = nodeType;
              if (query) payload.query = query;
              if (maxDepth !== undefined) payload.maxDepth = Math.max(1, Math.min(8, maxDepth));
              const result = await sdk.trigger({
                function_id: "mem::graph-query",
                payload,
              });
              return {
                status_code: 200,
                body: {
                  content: [
                    { type: "text", text: JSON.stringify(result, null, 2) },
                  ],
                },
              };
            } catch {
              return {
                status_code: 200,
                body: {
                  content: [
                    {
                      type: "text",
                      text: "Knowledge graph not enabled. Set GRAPH_EXTRACTION_ENABLED=true",
                    },
                  ],
                },
              };
            }
          }

          case "memory_consolidate": {
            try {
              const result = await sdk.trigger({ function_id: "mem::consolidate-pipeline", payload: {
                tier: args.tier as string,
              } });
              return {
                status_code: 200,
                body: {
                  content: [
                    { type: "text", text: JSON.stringify(result, null, 2) },
                  ],
                },
              };
            } catch {
              return {
                status_code: 200,
                body: {
                  content: [
                    {
                      type: "text",
                      text: "Consolidation not enabled. Set CONSOLIDATION_ENABLED=true",
                    },
                  ],
                },
              };
            }
          }

          case "memory_team_share": {
            if (
              typeof args.itemId !== "string" ||
              typeof args.itemType !== "string"
            ) {
              return {
                status_code: 400,
                body: { error: "itemId and itemType are required" },
              };
            }
            try {
              const result = await sdk.trigger({ function_id: "mem::team-share", payload: {
                itemId: args.itemId,
                itemType: args.itemType,
              } });
              return {
                status_code: 200,
                body: {
                  content: [
                    { type: "text", text: JSON.stringify(result, null, 2) },
                  ],
                },
              };
            } catch {
              return {
                status_code: 200,
                body: {
                  content: [
                    {
                      type: "text",
                      text: "Team memory not enabled. Set TEAM_ID and USER_ID",
                    },
                  ],
                },
              };
            }
          }

          case "memory_team_feed": {
            try {
              const result = await sdk.trigger({ function_id: "mem::team-feed", payload: {
                limit: typeof args.limit === "number" ? args.limit : 20,
              } });
              return {
                status_code: 200,
                body: {
                  content: [
                    { type: "text", text: JSON.stringify(result, null, 2) },
                  ],
                },
              };
            } catch {
              return {
                status_code: 200,
                body: {
                  content: [
                    {
                      type: "text",
                      text: "Team memory not enabled. Set TEAM_ID and USER_ID",
                    },
                  ],
                },
              };
            }
          }

          case "memory_audit": {
            try {
              const result = await sdk.trigger({ function_id: "mem::audit-query", payload: {
                operation: args.operation as string,
                limit: typeof args.limit === "number" ? args.limit : 50,
              } });
              return {
                status_code: 200,
                body: {
                  content: [
                    { type: "text", text: JSON.stringify(result, null, 2) },
                  ],
                },
              };
            } catch {
              return {
                status_code: 200,
                body: {
                  content: [{ type: "text", text: "Audit query failed" }],
                  isError: true,
                },
              };
            }
          }

          case "memory_governance_delete": {
            if (typeof args.memoryIds !== "string") {
              return {
                status_code: 400,
                body: { error: "memoryIds is required" },
              };
            }
            const ids = (args.memoryIds as string)
              .split(",")
              .map((id) => id.trim())
              .filter(Boolean);
            try {
              const result = await sdk.trigger({ function_id: "mem::governance-delete", payload: {
                memoryIds: ids,
                reason: args.reason as string,
              } });
              return {
                status_code: 200,
                body: {
                  content: [
                    { type: "text", text: JSON.stringify(result, null, 2) },
                  ],
                },
              };
            } catch {
              return {
                status_code: 200,
                body: {
                  content: [{ type: "text", text: "Governance delete failed" }],
                  isError: true,
                },
              };
            }
          }

          case "memory_snapshot_create": {
            try {
              const result = await sdk.trigger({ function_id: "mem::snapshot-create", payload: {
                message: args.message as string,
              } });
              return {
                status_code: 200,
                body: {
                  content: [
                    { type: "text", text: JSON.stringify(result, null, 2) },
                  ],
                },
              };
            } catch {
              return {
                status_code: 200,
                body: {
                  content: [
                    {
                      type: "text",
                      text: "Snapshots not enabled. Set SNAPSHOT_ENABLED=true",
                    },
                  ],
                },
              };
            }
          }

          case "memory_action_create": {
            if (typeof args.title !== "string" || !args.title.trim()) {
              return {
                status_code: 400,
                body: { error: "title is required" },
              };
            }
            const edges: Array<{ type: string; targetActionId: string }> = [];
            if (typeof args.requires === "string" && args.requires.trim()) {
              for (const id of args.requires.split(",").map((s: string) => s.trim()).filter(Boolean)) {
                edges.push({ type: "requires", targetActionId: id });
              }
            }
            const tags = typeof args.tags === "string" && args.tags.trim()
              ? args.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
              : [];
            const actionResult = await sdk.trigger({ function_id: "mem::action-create", payload: {
              title: args.title,
              description: args.description,
              priority: args.priority,
              project: args.project,
              tags,
              parentId: args.parentId,
              edges: edges.length > 0 ? edges : undefined,
            } });
            return {
              status_code: 200,
              body: {
                content: [
                  { type: "text", text: JSON.stringify(actionResult, null, 2) },
                ],
              },
            };
          }

          case "memory_action_update": {
            if (typeof args.actionId !== "string" || !args.actionId.trim()) {
              return {
                status_code: 400,
                body: { error: "actionId is required" },
              };
            }
            const updateResult = await sdk.trigger({ function_id: "mem::action-update", payload: {
              actionId: args.actionId,
              status: args.status,
              result: args.result,
              priority: args.priority,
            } });
            return {
              status_code: 200,
              body: {
                content: [
                  { type: "text", text: JSON.stringify(updateResult, null, 2) },
                ],
              },
            };
          }

          case "memory_frontier": {
            const frontierResult = await sdk.trigger({ function_id: "mem::frontier", payload: {
              project: args.project,
              agentId: args.agentId,
              limit: args.limit,
            } });
            return {
              status_code: 200,
              body: {
                content: [
                  { type: "text", text: JSON.stringify(frontierResult, null, 2) },
                ],
              },
            };
          }

          case "memory_next": {
            const nextResult = await sdk.trigger({ function_id: "mem::next", payload: {
              project: args.project,
              agentId: args.agentId,
            } });
            return {
              status_code: 200,
              body: {
                content: [
                  { type: "text", text: JSON.stringify(nextResult, null, 2) },
                ],
              },
            };
          }

          case "memory_lease": {
            if (
              typeof args.actionId !== "string" ||
              typeof args.agentId !== "string" ||
              typeof args.operation !== "string"
            ) {
              return {
                status_code: 400,
                body: { error: "actionId, agentId, and operation are required" },
              };
            }
            const op = args.operation as string;
            let leaseResult;
            if (op === "acquire") {
              leaseResult = await sdk.trigger({ function_id: "mem::lease-acquire", payload: {
                actionId: args.actionId,
                agentId: args.agentId,
                ttlMs: args.ttlMs,
              } });
            } else if (op === "release") {
              leaseResult = await sdk.trigger({ function_id: "mem::lease-release", payload: {
                actionId: args.actionId,
                agentId: args.agentId,
                result: args.result,
              } });
            } else if (op === "renew") {
              leaseResult = await sdk.trigger({ function_id: "mem::lease-renew", payload: {
                actionId: args.actionId,
                agentId: args.agentId,
                ttlMs: args.ttlMs,
              } });
            } else {
              return {
                status_code: 400,
                body: { error: "operation must be acquire, release, or renew" },
              };
            }
            return {
              status_code: 200,
              body: {
                content: [
                  { type: "text", text: JSON.stringify(leaseResult, null, 2) },
                ],
              },
            };
          }

          case "memory_routine_run": {
            if (typeof args.routineId !== "string") {
              return {
                status_code: 400,
                body: { error: "routineId is required" },
              };
            }
            const runResult = await sdk.trigger({ function_id: "mem::routine-run", payload: {
              routineId: args.routineId,
              project: args.project,
              initiatedBy: args.initiatedBy,
            } });
            return {
              status_code: 200,
              body: {
                content: [
                  { type: "text", text: JSON.stringify(runResult, null, 2) },
                ],
              },
            };
          }

          case "memory_signal_send": {
            if (
              typeof args.from !== "string" ||
              typeof args.content !== "string"
            ) {
              return {
                status_code: 400,
                body: { error: "from and content are required" },
              };
            }
            const sigResult = await sdk.trigger({ function_id: "mem::signal-send", payload: {
              from: args.from,
              to: args.to,
              content: args.content,
              type: args.type,
              replyTo: args.replyTo,
            } });
            return {
              status_code: 200,
              body: {
                content: [
                  { type: "text", text: JSON.stringify(sigResult, null, 2) },
                ],
              },
            };
          }

          case "memory_signal_read": {
            if (typeof args.agentId !== "string") {
              return {
                status_code: 400,
                body: { error: "agentId is required" },
              };
            }
            const readResult = await sdk.trigger({ function_id: "mem::signal-read", payload: {
              agentId: args.agentId,
              unreadOnly: args.unreadOnly === true || args.unreadOnly === "true",
              threadId: args.threadId,
              limit: args.limit,
            } });
            return {
              status_code: 200,
              body: {
                content: [
                  { type: "text", text: JSON.stringify(readResult, null, 2) },
                ],
              },
            };
          }

          case "memory_checkpoint": {
            const cpOp = args.operation as string;
            if (!cpOp) {
              return {
                status_code: 400,
                body: { error: "operation is required" },
              };
            }
            let cpResult;
            if (cpOp === "create") {
              const linkedIds = typeof args.linkedActionIds === "string" && args.linkedActionIds.trim()
                ? args.linkedActionIds.split(",").map((s: string) => s.trim())
                : [];
              cpResult = await sdk.trigger({ function_id: "mem::checkpoint-create", payload: {
                name: args.name,
                description: args.description,
                type: args.type,
                linkedActionIds: linkedIds,
              } });
            } else if (cpOp === "resolve") {
              if (typeof args.checkpointId !== "string" || !args.checkpointId.trim()) {
                return {
                  status_code: 400,
                  body: { error: "checkpointId is required for resolve operation" },
                };
              }
              cpResult = await sdk.trigger({ function_id: "mem::checkpoint-resolve", payload: {
                checkpointId: args.checkpointId,
                status: args.status,
              } });
            } else if (cpOp === "list") {
              cpResult = await sdk.trigger({ function_id: "mem::checkpoint-list", payload: {
                status: args.status,
                type: args.type,
              } });
            } else {
              return {
                status_code: 400,
                body: { error: "operation must be create, resolve, or list" },
              };
            }
            return {
              status_code: 200,
              body: {
                content: [
                  { type: "text", text: JSON.stringify(cpResult, null, 2) },
                ],
              },
            };
          }

          case "memory_mesh_sync": {
            const meshResult = await sdk.trigger({ function_id: "mem::mesh-sync", payload: {
              peerId: args.peerId,
              direction: args.direction,
            } });
            return {
              status_code: 200,
              body: {
                content: [
                  { type: "text", text: JSON.stringify(meshResult, null, 2) },
                ],
              },
            };
          }

          case "memory_sentinel_create": {
            let snlConfig: Record<string, unknown> = {};
            if (typeof args.config === "object" && args.config !== null) {
              snlConfig = args.config as Record<string, unknown>;
            } else if (typeof args.config === "string" && args.config.trim()) {
              try { snlConfig = JSON.parse(args.config); } catch { return { status_code: 400, body: { error: "invalid config JSON" } }; }
            }
            const snlLinked = parseCsvList(args.linkedActionIds);
            const expiresInMs = asNumber(args.expiresInMs);
            const name = asNonEmptyString(args.name);
            const type = asNonEmptyString(args.type);
            const payload: {
              name?: string;
              type?: string;
              config: Record<string, unknown>;
              linkedActionIds?: string[];
              expiresInMs?: number;
            } = { config: snlConfig };
            if (name) payload.name = name;
            if (type) payload.type = type;
            if (snlLinked.length) payload.linkedActionIds = snlLinked;
            if (expiresInMs !== undefined) payload.expiresInMs = Math.max(0, expiresInMs);
            const snlResult = await sdk.trigger({
              function_id: "mem::sentinel-create",
              payload,
            });
            return { status_code: 200, body: { content: [{ type: "text", text: JSON.stringify(snlResult, null, 2) }] } };
          }

          case "memory_sentinel_trigger": {
            let snlTrigPayload: unknown;
            if (args.result !== undefined && args.result !== null) {
              if (typeof args.result === "string") {
                try { snlTrigPayload = JSON.parse(args.result); } catch { return { status_code: 400, body: { error: "invalid result JSON" } }; }
              } else {
                snlTrigPayload = args.result;
              }
            }
            const sentinelId = asNonEmptyString(args.sentinelId);
            if (!sentinelId) {
              return {
                status_code: 400,
                body: { error: "sentinelId is required for memory_sentinel_trigger" },
              };
            }
            const snlTrigResult = await sdk.trigger({ function_id: "mem::sentinel-trigger", payload: {
              sentinelId,
              result: snlTrigPayload,
            } });
            return { status_code: 200, body: { content: [{ type: "text", text: JSON.stringify(snlTrigResult, null, 2) }] } };
          }

          case "memory_sketch_create": {
            const title = asNonEmptyString(args.title);
            if (!title) {
              return {
                status_code: 400,
                body: { error: "title is required for memory_sketch_create" },
              };
            }
            const sketchPayload = {
              title,
              description: asNonEmptyString(args.description),
              expiresInMs: asNumber(args.expiresInMs),
              project: asNonEmptyString(args.project),
            };
            const skResult = await sdk.trigger({
              function_id: "mem::sketch-create",
              payload: sketchPayload,
            });
            return { status_code: 200, body: { content: [{ type: "text", text: JSON.stringify(skResult, null, 2) }] } };
          }

          case "memory_sketch_promote": {
            const sketchId = asNonEmptyString(args.sketchId);
            if (!sketchId) {
              return {
                status_code: 400,
                body: { error: "sketchId is required for memory_sketch_promote" },
              };
            }
            const skpResult = await sdk.trigger({ function_id: "mem::sketch-promote", payload: {
              sketchId,
              project: args.project,
            } });
            return { status_code: 200, body: { content: [{ type: "text", text: JSON.stringify(skpResult, null, 2) }] } };
          }

          case "memory_crystallize": {
            if (typeof args.actionIds !== "string" || !args.actionIds.trim()) {
              return { status_code: 400, body: { error: "actionIds is required" } };
            }
            const crysIds = args.actionIds.split(",").map((s: string) => s.trim()).filter(Boolean);
            const crysResult = await sdk.trigger({ function_id: "mem::crystallize", payload: {
              actionIds: crysIds,
              project: args.project,
              sessionId: args.sessionId,
            } });
            return { status_code: 200, body: { content: [{ type: "text", text: JSON.stringify(crysResult, null, 2) }] } };
          }

          case "memory_diagnose": {
            const diagCats = typeof args.categories === "string" && args.categories.trim()
              ? args.categories.split(",").map((s: string) => s.trim()).filter(Boolean)
              : undefined;
            const diagResult = await sdk.trigger({ function_id: "mem::diagnose", payload: { categories: diagCats } });
            return { status_code: 200, body: { content: [{ type: "text", text: JSON.stringify(diagResult, null, 2) }] } };
          }

          case "memory_heal": {
            const healCats = typeof args.categories === "string" && args.categories.trim()
              ? args.categories.split(",").map((s: string) => s.trim()).filter(Boolean)
              : undefined;
            const healResult = await sdk.trigger({ function_id: "mem::heal", payload: {
              categories: healCats,
              dryRun: args.dryRun === true || args.dryRun === "true",
            } });
            return { status_code: 200, body: { content: [{ type: "text", text: JSON.stringify(healResult, null, 2) }] } };
          }

          case "memory_facet_tag": {
            const fctResult = await sdk.trigger({ function_id: "mem::facet-tag", payload: {
              targetId: args.targetId,
              targetType: args.targetType,
              dimension: args.dimension,
              value: args.value,
            } });
            return { status_code: 200, body: { content: [{ type: "text", text: JSON.stringify(fctResult, null, 2) }] } };
          }

          case "memory_facet_query": {
            if (args.matchAll !== undefined && typeof args.matchAll !== "string") {
              return { status_code: 400, body: { error: "matchAll must be a string" } };
            }
            if (args.matchAny !== undefined && typeof args.matchAny !== "string") {
              return { status_code: 400, body: { error: "matchAny must be a string" } };
            }
            const fqAll = typeof args.matchAll === "string" && args.matchAll.trim()
              ? args.matchAll.split(",").map((s: string) => s.trim()).filter(Boolean)
              : undefined;
            const fqAny = typeof args.matchAny === "string" && args.matchAny.trim()
              ? args.matchAny.split(",").map((s: string) => s.trim()).filter(Boolean)
              : undefined;
            const fqResult = await sdk.trigger({ function_id: "mem::facet-query", payload: {
              matchAll: fqAll,
              matchAny: fqAny,
              targetType: args.targetType,
            } });
            return { status_code: 200, body: { content: [{ type: "text", text: JSON.stringify(fqResult, null, 2) }] } };
          }

          case "memory_verify": {
            if (!args.id || typeof args.id !== "string") {
              return { status_code: 400, body: { error: "id is required" } };
            }
            const verifyResult = await sdk.trigger({ function_id: "mem::verify", payload: { id: args.id } });
            return { status_code: 200, body: { content: [{ type: "text", text: JSON.stringify(verifyResult, null, 2) }] } };
          }

          case "memory_lesson_save": {
            if (typeof args.content !== "string" || !args.content.trim()) {
              return { status_code: 400, body: { error: "content is required" } };
            }
            const lessonTags = typeof args.tags === "string" && args.tags.trim()
              ? args.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
              : [];
            const lessonSaveResult = await sdk.trigger({ function_id: "mem::lesson-save", payload: {
              content: args.content,
              context: args.context || "",
              confidence: args.confidence,
              project: args.project,
              tags: lessonTags,
              source: "manual",
            } });
            return { status_code: 200, body: { content: [{ type: "text", text: JSON.stringify(lessonSaveResult, null, 2) }] } };
          }

          case "memory_lesson_recall": {
            if (typeof args.query !== "string" || !args.query.trim()) {
              return { status_code: 400, body: { error: "query is required" } };
            }
            const lessonRecallResult = await sdk.trigger({ function_id: "mem::lesson-recall", payload: {
              query: args.query,
              project: args.project,
              minConfidence: args.minConfidence,
              limit: args.limit,
            } });
            return { status_code: 200, body: { content: [{ type: "text", text: JSON.stringify(lessonRecallResult, null, 2) }] } };
          }

          case "memory_reflect": {
            const reflectResult = await sdk.trigger({ function_id: "mem::reflect", payload: {
              project: args.project,
              maxClusters: args.maxClusters,
            } });
            return { status_code: 200, body: { content: [{ type: "text", text: JSON.stringify(reflectResult, null, 2) }] } };
          }

          case "memory_insight_list": {
            const insightListResult = await sdk.trigger({ function_id: "mem::insight-list", payload: {
              project: args.project,
              minConfidence: args.minConfidence,
              limit: args.limit,
            } });
            return { status_code: 200, body: { content: [{ type: "text", text: JSON.stringify(insightListResult, null, 2) }] } };
          }

          case "memory_obsidian_export": {
            const exportTypes = typeof args.types === "string" && args.types.trim()
              ? args.types.split(",").map((t: string) => t.trim()).filter(Boolean)
              : undefined;
            const obsidianResult = await sdk.trigger({ function_id: "mem::obsidian-export", payload: {
              vaultDir: args.vaultDir,
              types: exportTypes,
            } });
            return { status_code: 200, body: { content: [{ type: "text", text: JSON.stringify(obsidianResult, null, 2) }] } };
          }

          default:
            return {
              status_code: 400,
              body: { error: `Unknown tool: ${name}` },
            };
        }
      } catch (err) {
        return {
          status_code: 500,
          body: {
            error: "Internal error",
          },
        };
      }
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "mcp::tools::call",
    config: { api_path: "/agentmemory/mcp/call", http_method: "POST" },
  });

  const MCP_RESOURCES = [
    {
      uri: "agentmemory://status",
      name: "Agent Memory Status",
      description: "Current session count, memory count, and health status",
      mimeType: "application/json",
    },
    {
      uri: "agentmemory://project/{name}/profile",
      name: "Project Profile",
      description:
        "Top concepts, frequently modified files, and conventions for a project",
      mimeType: "application/json",
    },
    {
      uri: "agentmemory://project/{name}/recent",
      name: "Recent Sessions",
      description: "Last 5 session summaries for a project",
      mimeType: "application/json",
    },
    {
      uri: "agentmemory://memories/latest",
      name: "Latest Memories",
      description: "Top 10 latest memories with their type and strength",
      mimeType: "application/json",
    },
    {
      uri: "agentmemory://graph/stats",
      name: "Knowledge Graph Stats",
      description: "Node and edge counts by type in the knowledge graph",
      mimeType: "application/json",
    },
    {
      uri: "agentmemory://team/{id}/profile",
      name: "Team Profile",
      description: "Team memory profile with shared concepts and patterns",
      mimeType: "application/json",
    },
  ];

  sdk.registerFunction("mcp::resources::list", 
    async (req: ApiRequest): Promise<McpResponse> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      return { status_code: 200, body: { resources: MCP_RESOURCES } };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "mcp::resources::list",
    config: { api_path: "/agentmemory/mcp/resources", http_method: "GET" },
  });

  sdk.registerFunction("mcp::resources::read", 
    async (req: ApiRequest<{ uri: string }>): Promise<McpResponse> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;

      const uri = req.body?.uri;
      if (!uri || typeof uri !== "string") {
        return { status_code: 400, body: { error: "uri is required" } };
      }

      try {
        if (uri === "agentmemory://status") {
          const sessions = await kv.list<Session>(KV.sessions);
          const memories = await kv.list<Memory>(KV.memories);
          const healthData = await kv.list(KV.health).catch(() => []);
          return {
            status_code: 200,
            body: {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify({
                    sessionCount: sessions.length,
                    memoryCount: memories.length,
                    healthStatus:
                      healthData.length > 0 ? "available" : "no-data",
                  }),
                },
              ],
            },
          };
        }

        const projectProfileMatch = uri.match(
          /^agentmemory:\/\/project\/(.+)\/profile$/,
        );
        if (projectProfileMatch) {
          let projectName: string;
          try {
            projectName = decodeURIComponent(projectProfileMatch[1]);
          } catch {
            return {
              status_code: 400,
              body: { error: "Invalid percent-encoding in URI" },
            };
          }
          const profile = await sdk.trigger({ function_id: "mem::profile", payload: {
            project: projectName,
          } });
          return {
            status_code: 200,
            body: {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify(profile),
                },
              ],
            },
          };
        }

        const projectRecentMatch = uri.match(
          /^agentmemory:\/\/project\/(.+)\/recent$/,
        );
        if (projectRecentMatch) {
          let projectName: string;
          try {
            projectName = decodeURIComponent(projectRecentMatch[1]);
          } catch {
            return {
              status_code: 400,
              body: { error: "Invalid percent-encoding in URI" },
            };
          }
          const summaries = await kv.list<SessionSummary>(KV.summaries);
          const filtered = summaries
            .filter((s) => s.project === projectName)
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            )
            .slice(0, 5);
          return {
            status_code: 200,
            body: {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify(filtered),
                },
              ],
            },
          };
        }

        if (uri === "agentmemory://memories/latest") {
          const memories = await kv.list<Memory>(KV.memories);
          const latest = memories
            .filter((m) => m.isLatest)
            .sort(
              (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime(),
            )
            .slice(0, 10)
            .map((m) => ({
              id: m.id,
              title: m.title,
              type: m.type,
              strength: m.strength,
            }));
          return {
            status_code: 200,
            body: {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify(latest),
                },
              ],
            },
          };
        }

        if (uri === "agentmemory://graph/stats") {
          try {
            const nodes = await kv.list<GraphNode>(KV.graphNodes);
            const edges = await kv.list<GraphEdge>(KV.graphEdges);
            const nodesByType: Record<string, number> = {};
            for (const n of nodes)
              nodesByType[n.type] = (nodesByType[n.type] || 0) + 1;
            const edgesByType: Record<string, number> = {};
            for (const e of edges)
              edgesByType[e.type] = (edgesByType[e.type] || 0) + 1;
            return {
              status_code: 200,
              body: {
                contents: [
                  {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify({
                      totalNodes: nodes.length,
                      totalEdges: edges.length,
                      nodesByType,
                      edgesByType,
                    }),
                  },
                ],
              },
            };
          } catch {
            return {
              status_code: 200,
              body: {
                contents: [
                  {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify({
                      totalNodes: 0,
                      totalEdges: 0,
                    }),
                  },
                ],
              },
            };
          }
        }

        const teamProfileMatch = uri.match(
          /^agentmemory:\/\/team\/(.+)\/profile$/,
        );
        if (teamProfileMatch) {
          try {
            const teamId = decodeURIComponent(teamProfileMatch[1]);
            const items = await kv.list(KV.teamShared(teamId));
            return {
              status_code: 200,
              body: {
                contents: [
                  {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify({
                      teamId,
                      sharedItems: items.length,
                    }),
                  },
                ],
              },
            };
          } catch {
            return {
              status_code: 200,
              body: {
                contents: [
                  {
                    uri,
                    mimeType: "application/json",
                    text: JSON.stringify({
                      teamId: teamProfileMatch[1],
                      sharedItems: 0,
                    }),
                  },
                ],
              },
            };
          }
        }

        return {
          status_code: 404,
          body: { error: `Unknown resource: ${uri}` },
        };
      } catch {
        return { status_code: 500, body: { error: "Internal error" } };
      }
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "mcp::resources::read",
    config: {
      api_path: "/agentmemory/mcp/resources/read",
      http_method: "POST",
    },
  });

  const MCP_PROMPTS = [
    {
      name: "recall_context",
      description:
        "Search observations and memories to build context for a task",
      arguments: [
        {
          name: "task_description",
          description: "What you are working on",
          required: true,
        },
      ],
    },
    {
      name: "session_handoff",
      description:
        "Generate a handoff summary for continuing work in a new session",
      arguments: [
        {
          name: "session_id",
          description: "Session ID to hand off from",
          required: true,
        },
      ],
    },
    {
      name: "detect_patterns",
      description: "Detect recurring patterns across sessions for a project",
      arguments: [
        {
          name: "project",
          description: "Project path to analyze (optional)",
          required: false,
        },
      ],
    },
  ];

  sdk.registerFunction("mcp::prompts::list", 
    async (req: ApiRequest): Promise<McpResponse> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      return { status_code: 200, body: { prompts: MCP_PROMPTS } };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "mcp::prompts::list",
    config: { api_path: "/agentmemory/mcp/prompts", http_method: "GET" },
  });

  sdk.registerFunction("mcp::prompts::get", 
    async (
      req: ApiRequest<{ name: string; arguments?: Record<string, string> }>,
    ): Promise<McpResponse> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;

      const promptName = req.body?.name;
      if (!promptName || typeof promptName !== "string") {
        return { status_code: 400, body: { error: "name is required" } };
      }

      const promptArgs = req.body?.arguments || {};

      try {
        switch (promptName) {
          case "recall_context": {
            const taskDesc = promptArgs.task_description;
            if (typeof taskDesc !== "string" || !taskDesc.trim()) {
              return {
                status_code: 400,
                body: {
                  error:
                    "task_description argument is required and must be a string",
                },
              };
            }
            const searchResult = await sdk
              .trigger({
                function_id: "mem::search",
                payload: { query: taskDesc, limit: 10 },
              })
              .catch(() => ({ results: [] }));
            const memories = await kv.list<Memory>(KV.memories);
            const relevant = memories.filter((m) => m.isLatest).slice(0, 5);
            return {
              status_code: 200,
              body: {
                messages: [
                  {
                    role: "user",
                    content: {
                      type: "text",
                      text: `Here is relevant context from past sessions for the task: "${taskDesc}"\n\n## Past Observations\n${JSON.stringify(searchResult, null, 2)}\n\n## Relevant Memories\n${JSON.stringify(relevant, null, 2)}`,
                    },
                  },
                ],
              },
            };
          }

          case "session_handoff": {
            const sessionId = promptArgs.session_id;
            if (typeof sessionId !== "string" || !sessionId.trim()) {
              return {
                status_code: 400,
                body: {
                  error: "session_id argument is required and must be a string",
                },
              };
            }
            const session = await kv.get<Session>(KV.sessions, sessionId);
            const summaries = await kv.list<SessionSummary>(KV.summaries);
            const summary = summaries.find((s) => s.sessionId === sessionId);
            return {
              status_code: 200,
              body: {
                messages: [
                  {
                    role: "user",
                    content: {
                      type: "text",
                      text: `## Session Handoff\n\n### Session\n${JSON.stringify(session, null, 2)}\n\n### Summary\n${JSON.stringify(summary || "No summary available", null, 2)}`,
                    },
                  },
                ],
              },
            };
          }

          case "detect_patterns": {
            if (
              promptArgs.project !== undefined &&
              typeof promptArgs.project !== "string"
            ) {
              return {
                status_code: 400,
                body: { error: "project argument must be a string" },
              };
            }
            const result = await sdk.trigger({ function_id: "mem::patterns", payload: {
              project: promptArgs.project || undefined,
            } });
            return {
              status_code: 200,
              body: {
                messages: [
                  {
                    role: "user",
                    content: {
                      type: "text",
                      text: `## Pattern Analysis\n\n${JSON.stringify(result, null, 2)}`,
                    },
                  },
                ],
              },
            };
          }

          default:
            return {
              status_code: 400,
              body: { error: `Unknown prompt: ${promptName}` },
            };
        }
      } catch {
        return { status_code: 500, body: { error: "Internal error" } };
      }
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "mcp::prompts::get",
    config: { api_path: "/agentmemory/mcp/prompts/get", http_method: "POST" },
  });
}
