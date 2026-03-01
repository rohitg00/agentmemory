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
import { getAllTools } from "./tools-registry.js";

type McpResponse = {
  status_code: number;
  headers?: Record<string, string>;
  body: unknown;
};

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
    if (auth !== `Bearer ${sec}`) {
      return { status_code: 401, body: { error: "unauthorized" } };
    }
    return null;
  }

  sdk.registerFunction(
    { id: "mcp::tools::list" },
    async (req: ApiRequest): Promise<McpResponse> => {
      const authErr = checkAuth(req, secret);
      if (authErr) return authErr;
      return { status_code: 200, body: { tools: getAllTools() } };
    },
  );
  sdk.registerTrigger({
    type: "http",
    function_id: "mcp::tools::list",
    config: { api_path: "/agentmemory/mcp/tools", http_method: "GET" },
  });

  sdk.registerFunction(
    { id: "mcp::tools::call" },
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
            const result = await sdk.trigger("mem::search", {
              query: args.query,
              limit: (args.limit as number) || 10,
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

          case "memory_save": {
            if (typeof args.content !== "string" || !args.content.trim()) {
              return {
                status_code: 400,
                body: { error: "content is required for memory_save" },
              };
            }
            const type = (args.type as string) || "fact";
            const concepts = args.concepts
              ? (args.concepts as string)
                  .split(",")
                  .map((c: string) => c.trim())
              : [];
            const files = args.files
              ? (args.files as string).split(",").map((f: string) => f.trim())
              : [];

            const result = await sdk.trigger("mem::remember", {
              content: args.content,
              type,
              concepts,
              files,
            });
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
            const fileList = (args.files as string)
              .split(",")
              .map((f: string) => f.trim());
            const result = await sdk.trigger("mem::file-context", {
              sessionId: (args.sessionId as string) || "",
              files: fileList,
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
            const result = await sdk.trigger("mem::patterns", {
              project: args.project as string,
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
            const expandIds = args.expandIds
              ? (args.expandIds as string)
                  .split(",")
                  .map((id: string) => id.trim())
                  .slice(0, 20)
              : [];
            const result = await sdk.trigger("mem::smart-search", {
              query: args.query,
              expandIds,
              limit: (args.limit as number) || 10,
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
            const result = await sdk.trigger("mem::timeline", {
              anchor: args.anchor,
              project: (args.project as string) || undefined,
              before: (args.before as number) || 5,
              after: (args.after as number) || 5,
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

          case "memory_profile": {
            if (typeof args.project !== "string" || !args.project.trim()) {
              return {
                status_code: 400,
                body: { error: "project is required for memory_profile" },
              };
            }
            const result = await sdk.trigger("mem::profile", {
              project: args.project,
              refresh: args.refresh === "true",
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

          case "memory_export": {
            const result = await sdk.trigger("mem::export", {});
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
            const result = await sdk.trigger("mem::get-related", {
              memoryId: args.memoryId,
              maxHops: Number.isFinite(rawMaxHops) ? rawMaxHops : 2,
              minConfidence: Number.isFinite(rawMinConf)
                ? Math.max(0, Math.min(1, rawMinConf))
                : 0,
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

          case "memory_claude_bridge_sync": {
            const direction = (args.direction as string) || "write";
            const funcId =
              direction === "read"
                ? "mem::claude-bridge-read"
                : "mem::claude-bridge-sync";
            try {
              const result = await sdk.trigger(funcId, {});
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
              const result = await sdk.trigger("mem::graph-query", {
                startNodeId: args.startNodeId as string,
                nodeType: args.nodeType as string,
                maxDepth: args.maxDepth as number,
                query: args.query as string,
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
              const result = await sdk.trigger("mem::consolidate-pipeline", {
                tier: args.tier as string,
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
              const result = await sdk.trigger("mem::team-share", {
                itemId: args.itemId,
                itemType: args.itemType,
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
                      text: "Team memory not enabled. Set TEAM_ID and USER_ID",
                    },
                  ],
                },
              };
            }
          }

          case "memory_team_feed": {
            try {
              const result = await sdk.trigger("mem::team-feed", {
                limit: (args.limit as number) || 20,
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
                      text: "Team memory not enabled. Set TEAM_ID and USER_ID",
                    },
                  ],
                },
              };
            }
          }

          case "memory_audit": {
            try {
              const result = await sdk.trigger("mem::audit-query", {
                operation: args.operation as string,
                limit: (args.limit as number) || 50,
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
              const result = await sdk.trigger("mem::governance-delete", {
                memoryIds: ids,
                reason: args.reason as string,
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
                  content: [{ type: "text", text: "Governance delete failed" }],
                  isError: true,
                },
              };
            }
          }

          case "memory_snapshot_create": {
            try {
              const result = await sdk.trigger("mem::snapshot-create", {
                message: args.message as string,
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
                      text: "Snapshots not enabled. Set SNAPSHOT_ENABLED=true",
                    },
                  ],
                },
              };
            }
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

  sdk.registerFunction(
    { id: "mcp::resources::list" },
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

  sdk.registerFunction(
    { id: "mcp::resources::read" },
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
          const profile = await sdk.trigger("mem::profile", {
            project: projectName,
          });
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

  sdk.registerFunction(
    { id: "mcp::prompts::list" },
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

  sdk.registerFunction(
    { id: "mcp::prompts::get" },
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
              .trigger("mem::search", { query: taskDesc, limit: 10 })
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
            const result = await sdk.trigger("mem::patterns", {
              project: promptArgs.project || undefined,
            });
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
