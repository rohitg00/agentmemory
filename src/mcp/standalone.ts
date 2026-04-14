#!/usr/bin/env node

import { InMemoryKV } from "./in-memory-kv.js";
import { createStdioTransport } from "./transport.js";
import { getVisibleTools } from "./tools-registry.js";
import { getStandalonePersistPath } from "../config.js";
import { VERSION } from "../version.js";
import { generateId } from "../state/schema.js";

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

// Accept arrays, comma-separated strings, or a single string and always
// return a trimmed, non-empty string array. Plugin skills (#139) tell
// Claude to pass arrays; older clients may still pass CSV strings.
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

// Parse a user-supplied limit argument, clamping to a sane range so an
// adversarial or buggy caller can't request a million memories or pass
// a negative / NaN / Infinity value that breaks .slice().
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
function parseLimit(raw: unknown, fallback = DEFAULT_LIMIT): number {
  // Only accept explicit numbers or numeric strings. Reject booleans,
  // objects, arrays, null, undefined — they shouldn't silently coerce
  // (e.g. `Number(true) === 1` would sneak a limit of 1 through).
  if (typeof raw !== "number" && typeof raw !== "string") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

export async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  kvInstance: InMemoryKV = kv,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (toolName) {
    case "memory_save": {
      const rawContent = args.content;
      if (typeof rawContent !== "string" || !rawContent.trim()) {
        throw new Error("content is required");
      }
      const content = rawContent;
      const id = generateId("mem");
      const isoNow = new Date().toISOString();
      await kvInstance.set("mem:memories", id, {
        id,
        type: (args.type as string) || "fact",
        title: content.slice(0, 80),
        content,
        concepts: normalizeList(args.concepts),
        files: normalizeList(args.files),
        createdAt: isoNow,
        updatedAt: isoNow,
        strength: 7,
        version: 1,
        isLatest: true,
        sessionIds: [],
      });
      kvInstance.persist();
      return {
        content: [{ type: "text", text: JSON.stringify({ saved: id }) }],
      };
    }

    case "memory_recall":
    case "memory_smart_search": {
      // memory_smart_search would normally run hybrid BM25+vector+graph
      // in the engine-backed path, but the standalone shim (#139) only
      // has the in-memory KV store, so we fall back to a substring
      // filter. The tool name is kept so plugin skills that say "use
      // memory_smart_search" still work.
      //
      // Empty/missing query is rejected — the forget skill uses this
      // as its confirmation step before a destructive delete, and an
      // empty query would match every memory in the store, surfacing
      // unrelated IDs for deletion.
      const rawQuery = args.query;
      if (typeof rawQuery !== "string" || !rawQuery.trim()) {
        throw new Error("query is required");
      }
      const query = rawQuery.trim().toLowerCase();
      const limit = parseLimit(args.limit);
      const all =
        await kvInstance.list<Record<string, unknown>>("mem:memories");
      const results = all
        .filter((m) => {
          // Search title/content AND files/concepts/sessionIds so the
          // forget skill can find memories by file path or session
          // ID, not just by narrative text.
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
          return text.includes(query);
        })
        .slice(0, limit);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }

    case "memory_sessions": {
      const sessions =
        await kvInstance.list<Record<string, unknown>>("mem:sessions");
      const limit = parseLimit(args.limit, 20);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { sessions: sessions.slice(0, limit) },
              null,
              2,
            ),
          },
        ],
      };
    }

    case "memory_governance_delete": {
      // Deletes memories by id. Accepts either a memoryIds array or a
      // comma-separated memoryIds string (same normalization pattern as
      // concepts/files) so plugin skills and legacy clients both work.
      // Unknown ids are silently skipped — the response reports how many
      // were actually removed so the caller can tell the user.
      const ids = normalizeList(args.memoryIds);
      if (ids.length === 0) {
        throw new Error("memoryIds is required");
      }
      let deleted = 0;
      for (const id of ids) {
        const existing = await kvInstance.get("mem:memories", id);
        if (existing) {
          await kvInstance.delete("mem:memories", id);
          deleted++;
        }
      }
      kvInstance.persist();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              deleted,
              requested: ids.length,
              reason: (args.reason as string) || "plugin skill request",
            }),
          },
        ],
      };
    }

    case "memory_export": {
      const memories = await kvInstance.list("mem:memories");
      const sessions = await kvInstance.list("mem:sessions");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { version: VERSION, memories, sessions },
              null,
              2,
            ),
          },
        ],
      };
    }

    case "memory_audit": {
      const entries = await kvInstance.list("mem:audit");
      const limit = parseLimit(args.limit, 50);
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
      return {
        tools: getVisibleTools().filter((t) => IMPLEMENTED_TOOLS.has(t.name)),
      };

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
