#!/usr/bin/env node

import { InMemoryKV } from "./in-memory-kv.js";
import { createStdioTransport } from "./transport.js";
import { getAllTools } from "./tools-registry.js";
import { getStandalonePersistPath } from "../config.js";

const SERVER_INFO = {
  name: "agentmemory",
  version: "0.4.0",
  protocolVersion: "2024-11-05",
};

const kv = new InMemoryKV(getStandalonePersistPath());

async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (toolName) {
    case "memory_save": {
      const content = args.content as string;
      if (!content?.trim()) throw new Error("content is required");
      const id = `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      await kv.set("mem:memories", id, {
        id,
        type: (args.type as string) || "fact",
        title: content.slice(0, 80),
        content,
        concepts: args.concepts
          ? (args.concepts as string).split(",").map((c) => c.trim())
          : [],
        files: args.files
          ? (args.files as string).split(",").map((f) => f.trim())
          : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        strength: 7,
        version: 1,
        isLatest: true,
        sessionIds: [],
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ saved: id }) }],
      };
    }

    case "memory_recall": {
      const query = (args.query as string)?.toLowerCase() || "";
      const limit = (args.limit as number) || 10;
      const all = await kv.list<Record<string, unknown>>("mem:memories");
      const results = all
        .filter((m) => {
          const text = `${m.title} ${m.content}`.toLowerCase();
          return text.includes(query);
        })
        .slice(0, limit);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }

    case "memory_sessions": {
      const sessions = await kv.list("mem:sessions");
      return {
        content: [
          { type: "text", text: JSON.stringify({ sessions }, null, 2) },
        ],
      };
    }

    case "memory_export": {
      const memories = await kv.list("mem:memories");
      const sessions = await kv.list("mem:sessions");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { version: "0.4.0", memories, sessions },
              null,
              2,
            ),
          },
        ],
      };
    }

    case "memory_audit": {
      const entries = await kv.list("mem:audit");
      const limit = (args.limit as number) || 50;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              (entries as Array<Record<string, unknown>>).slice(0, limit),
              null,
              2,
            ),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

const transport = createStdioTransport(async (method, params) => {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: SERVER_INFO.protocolVersion,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: SERVER_INFO.name,
          version: SERVER_INFO.version,
        },
      };

    case "notifications/initialized":
      return {};

    case "tools/list":
      return { tools: getAllTools() };

    case "tools/call": {
      const toolName = params.name as string;
      const toolArgs = (params.arguments as Record<string, unknown>) || {};
      try {
        return await handleToolCall(toolName, toolArgs);
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }

    default:
      throw new Error(`Unknown method: ${method}`);
  }
});

process.stderr.write(
  `[agentmemory-mcp] Standalone MCP server v${SERVER_INFO.version} starting...\n`,
);
transport.start();

process.on("SIGINT", () => {
  kv.persist();
  process.exit(0);
});
process.on("SIGTERM", () => {
  kv.persist();
  process.exit(0);
});
