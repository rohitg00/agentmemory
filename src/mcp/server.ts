import type { ISdk, ApiRequest } from "iii-sdk";
import type { StateKV } from "../state/kv.js";
import { KV } from "../state/schema.js";

type McpTool = {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
};

type McpResponse = {
  status_code: number;
  headers?: Record<string, string>;
  body: unknown;
};

const MCP_TOOLS: McpTool[] = [
  {
    name: "memory_recall",
    description:
      "Search past session observations for relevant context. Use when you need to recall what happened in previous sessions, find past decisions, or look up how a file was modified before.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (keywords, file names, concepts)",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_save",
    description:
      "Explicitly save an important insight, decision, or pattern to long-term memory. Use when you discover something worth remembering for future sessions.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The insight or decision to remember",
        },
        type: {
          type: "string",
          description:
            "Memory type: pattern, preference, architecture, bug, workflow, or fact",
        },
        concepts: {
          type: "string",
          description: "Comma-separated key concepts for searchability",
        },
        files: {
          type: "string",
          description: "Comma-separated relevant file paths",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "memory_file_history",
    description:
      "Get past observations about specific files. Use before modifying a file to understand its history and past changes.",
    inputSchema: {
      type: "object",
      properties: {
        files: {
          type: "string",
          description: "Comma-separated file paths to look up",
        },
        sessionId: {
          type: "string",
          description: "Current session ID to exclude from results",
        },
      },
      required: ["files"],
    },
  },
  {
    name: "memory_patterns",
    description:
      "Detect recurring patterns across sessions: files that change together, repeated errors, common workflows.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description:
            "Project path to analyze (optional, analyzes all if omitted)",
        },
      },
    },
  },
  {
    name: "memory_sessions",
    description:
      "List recent sessions with their status and observation counts.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "memory_smart_search",
    description:
      "Hybrid semantic+keyword search with progressive disclosure. Returns compact summaries first; pass expandIds to get full observation text.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query combining semantic and keyword matching",
        },
        expandIds: {
          type: "string",
          description:
            "Comma-separated observation IDs to expand with full text",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_timeline",
    description:
      "Chronological observations around an anchor point. Use to see what happened before and after a specific date or event.",
    inputSchema: {
      type: "object",
      properties: {
        anchor: {
          type: "string",
          description:
            "Anchor point: ISO date (e.g. 2026-02-15) or keyword (today, yesterday, last-week)",
        },
        project: {
          type: "string",
          description: "Filter by project path",
        },
        before: {
          type: "number",
          description: "Number of observations before anchor (default 5)",
        },
        after: {
          type: "number",
          description: "Number of observations after anchor (default 5)",
        },
      },
      required: ["anchor"],
    },
  },
  {
    name: "memory_profile",
    description:
      "User/project profile with top concepts, frequently modified files, and recurring patterns.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "Project path to build profile for",
        },
        refresh: {
          type: "string",
          description: "Set to 'true' to force rebuild the profile cache",
        },
      },
      required: ["project"],
    },
  },
  {
    name: "memory_export",
    description:
      "Export all memory data as JSON. Useful for backup or migration.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "memory_relations",
    description:
      "Query the memory relationship graph. Returns related memories within a given hop distance.",
    inputSchema: {
      type: "object",
      properties: {
        memoryId: {
          type: "string",
          description: "ID of the memory to find relations for",
        },
        maxHops: {
          type: "number",
          description: "Maximum graph traversal depth (default 2)",
        },
      },
      required: ["memoryId"],
    },
  },
];

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
      return { status_code: 200, body: { tools: MCP_TOOLS } };
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
            const result = await sdk.trigger("mem::get-related", {
              memoryId: args.memoryId,
              maxHops: (args.maxHops as number) || 2,
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
}
