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
    async (): Promise<McpResponse> => ({
      status_code: 200,
      body: { tools: MCP_TOOLS },
    }),
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
            error: err instanceof Error ? err.message : "Internal error",
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
