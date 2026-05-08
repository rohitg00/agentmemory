#!/usr/bin/env node

import { InMemoryKV } from "./in-memory-kv.js";
import { createStdioTransport } from "./transport.js";
import { getVisibleTools } from "./tools-registry.js";
import { getStandalonePersistPath } from "../config.js";
import { VERSION } from "../version.js";
import { generateId } from "../state/schema.js";
import {
  resolveHandle,
  invalidateHandle,
  type Handle,
} from "./rest-proxy.js";

const IMPLEMENTED_TOOLS = new Set([
  "memory_save",
  "memory_recall",
  "memory_smart_search",
  "memory_sessions",
  "memory_export",
  "memory_audit",
  "memory_governance_delete",
]);

const SERVER_INFO = {
  name: "agentmemory",
  version: VERSION,
  protocolVersion: "2024-11-05",
};

const kv = new InMemoryKV(getStandalonePersistPath());
let modeAnnounced = false;

function announceMode(handle: Handle): void {
  if (modeAnnounced) return;
  modeAnnounced = true;
  if (handle.mode === "proxy") {
    process.stderr.write(
      `[@agentmemory/mcp] proxying to agentmemory server at ${handle.baseUrl}\n`,
    );
  } else {
    process.stderr.write(
      `[@agentmemory/mcp] no server reachable at ${process.env["AGENTMEMORY_URL"] || "http://localhost:3111"}; falling back to local InMemoryKV\n`,
    );
  }
}

function normalizeList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((v) => v.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
function parseLimit(raw: unknown, fallback = DEFAULT_LIMIT): number {
  if (typeof raw !== "number" && typeof raw !== "string") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function textResponse(payload: unknown, pretty = false): {
  content: Array<{ type: string; text: string }>;
} {
  return {
    content: [
      { type: "text", text: JSON.stringify(payload, null, pretty ? 2 : 0) },
    ],
  };
}

interface Validated {
  tool: string;
  content?: string;
  type?: string;
  concepts?: string[];
  files?: string[];
  query?: string;
  limit?: number;
  memoryIds?: string[];
  reason?: string;
}

function validate(toolName: string, args: Record<string, unknown>): Validated {
  if (!IMPLEMENTED_TOOLS.has(toolName)) {
    throw new Error(`Unknown tool: ${toolName}`);
  }
  const v: Validated = { tool: toolName };
  switch (toolName) {
    case "memory_save": {
      const content = args["content"];
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("content is required");
      }
      v.content = content;
      v.type = (args["type"] as string) || "fact";
      v.concepts = normalizeList(args["concepts"]);
      v.files = normalizeList(args["files"]);
      return v;
    }
    case "memory_recall":
    case "memory_smart_search": {
      const query = args["query"];
      if (typeof query !== "string" || !query.trim()) {
        throw new Error("query is required");
      }
      v.query = query.trim();
      v.limit = parseLimit(args["limit"]);
      return v;
    }
    case "memory_sessions": {
      v.limit = parseLimit(args["limit"], 20);
      return v;
    }
    case "memory_governance_delete": {
      const ids = normalizeList(args["memoryIds"]);
      if (ids.length === 0) throw new Error("memoryIds is required");
      v.memoryIds = ids;
      v.reason = (args["reason"] as string) || "plugin skill request";
      return v;
    }
    case "memory_export":
      return v;
    case "memory_audit": {
      v.limit = parseLimit(args["limit"], 50);
      return v;
    }
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

async function handleLocal(
  v: Validated,
  kvInstance: InMemoryKV,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (v.tool) {
    case "memory_save": {
      const id = generateId("mem");
      const isoNow = new Date().toISOString();
      await kvInstance.set("mem:memories", id, {
        id,
        type: v.type,
        title: (v.content || "").slice(0, 80),
        content: v.content,
        concepts: v.concepts,
        files: v.files,
        createdAt: isoNow,
        updatedAt: isoNow,
        strength: 7,
        version: 1,
        isLatest: true,
        sessionIds: [],
      });
      kvInstance.persist();
      return textResponse({ saved: id });
    }

    case "memory_recall":
    case "memory_smart_search": {
      const query = (v.query || "").toLowerCase();
      const limit = v.limit ?? DEFAULT_LIMIT;
      const all =
        await kvInstance.list<Record<string, unknown>>("mem:memories");
      const results = all
        .filter((m) => {
          const text = [
            typeof m["title"] === "string" ? m["title"] : "",
            typeof m["content"] === "string" ? m["content"] : "",
            Array.isArray(m["files"]) ? m["files"].join(" ") : "",
            Array.isArray(m["concepts"]) ? m["concepts"].join(" ") : "",
            Array.isArray(m["sessionIds"]) ? m["sessionIds"].join(" ") : "",
            typeof m["id"] === "string" ? m["id"] : "",
          ]
            .join(" ")
            .toLowerCase();
          return query.split(/\s+/).every((word) => text.includes(word));
        })
        .slice(0, limit);
      return textResponse({ mode: "compact", results }, true);
    }

    case "memory_sessions": {
      const sessions =
        await kvInstance.list<Record<string, unknown>>("mem:sessions");
      const limit = v.limit ?? 20;
      return textResponse({ sessions: sessions.slice(0, limit) }, true);
    }

    case "memory_governance_delete": {
      let deleted = 0;
      for (const id of v.memoryIds || []) {
        const existing = await kvInstance.get("mem:memories", id);
        if (existing) {
          await kvInstance.delete("mem:memories", id);
          deleted++;
        }
      }
      kvInstance.persist();
      return textResponse({
        deleted,
        requested: (v.memoryIds || []).length,
        reason: v.reason,
      });
    }

    case "memory_export": {
      const memories = await kvInstance.list("mem:memories");
      const sessions = await kvInstance.list("mem:sessions");
      return textResponse({ version: VERSION, memories, sessions }, true);
    }

    case "memory_audit": {
      const entries = await kvInstance.list("mem:audit");
      const limit = v.limit ?? 50;
      return textResponse(
        {
          entries: (entries as Array<Record<string, unknown>>).slice(0, limit),
        },
        true,
      );
    }

    default:
      throw new Error(`Unknown tool: ${v.tool}`);
  }
}

export async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  kvInstance: InMemoryKV = kv,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const handle = await resolveHandle();
  announceMode(handle);

  if (handle.mode === "proxy") {
    try {
      const result = await handle.call("/agentmemory/mcp/call", {
        method: "POST",
        body: JSON.stringify({ name: toolName, arguments: args }),
      });
      const content = (result as { content?: Array<{ type: string; text: string }> })?.content;
      if (Array.isArray(content)) {
        return { content };
      }
      return textResponse(result);
    } catch (err) {
      process.stderr.write(
        `[@agentmemory/mcp] proxy call failed for ${toolName}: ${err instanceof Error ? err.message : String(err)}; invalidating handle and falling back to local KV\n`,
      );
      invalidateHandle();
    }
  }

  const validated = validate(toolName, args);
  return handleLocal(validated, kvInstance);
}

const transport = createStdioTransport(async (method, params) => {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: SERVER_INFO.protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: SERVER_INFO.name,
          version: SERVER_INFO.version,
        },
      };

    case "notifications/initialized":
      return {};

    case "tools/list": {
      const handle = await resolveHandle();
      announceMode(handle);
      if (handle.mode === "proxy") {
        try {
          const result = await handle.call("/agentmemory/mcp/tools");
          const tools = (result as { tools?: unknown[] })?.tools;
          if (Array.isArray(tools)) return { tools };
          process.stderr.write(
            `[@agentmemory/mcp] tools/list proxy returned unexpected shape; falling back to local list\n`,
          );
        } catch (err) {
          process.stderr.write(
            `[@agentmemory/mcp] tools/list proxy failed: ${err instanceof Error ? err.message : String(err)}; falling back to local list\n`,
          );
        }
      }
      return {
        tools: getVisibleTools().filter((t) => IMPLEMENTED_TOOLS.has(t.name)),
      };
    }

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
  `[@agentmemory/mcp] Standalone MCP server v${SERVER_INFO.version} starting...\n`,
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
