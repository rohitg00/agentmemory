#!/usr/bin/env node

import { InMemoryKV } from "./in-memory-kv.js";
import { createStdioTransport } from "./transport.js";
import { getAllTools } from "./tools-registry.js";
import { getStandalonePersistPath } from "../config.js";
import { VERSION } from "../version.js";
import { generateId } from "../state/schema.js";
import {
  resolveHandle,
  invalidateHandle,
  type Handle,
  type ProxyHandle,
} from "./rest-proxy.js";

const IMPLEMENTED_TOOLS = new Set([
  // New consolidated tools
  "memory_search",
  "memory_store",
  "memory_profile",
  "memory_sessions",
  "task",
  "task_plan",
  "signal",
  "checkpoint",
  "sketch",
  "crystal",
  "lesson",
  "insight",
  "slot",
  // Legacy aliases (forwarded to server via generic proxy)
  "memory_recall",
  "memory_smart_search",
  "memory_save",
  "memory_compress_file",
  "memory_export",
  "memory_consolidate",
  "memory_claude_bridge_sync",
  "memory_mesh_sync",
  "memory_file_history",
  "memory_graph_query",
  "memory_vision_search",
  "memory_timeline",
  "memory_relations",
  "memory_action_create",
  "memory_action_update",
  "memory_frontier",
  "memory_next",
  "memory_lease",
  "memory_routine_run",
  "memory_signal_send",
  "memory_signal_read",
  "memory_checkpoint",
  "memory_sentinel_create",
  "memory_sentinel_trigger",
  "memory_sketch_create",
  "memory_sketch_promote",
  "memory_crystallize",
  "memory_diagnose",
  "memory_heal",
  "memory_audit",
  "memory_governance_delete",
  "memory_obsidian_export",
  "memory_verify",
  "memory_lesson_save",
  "memory_lesson_recall",
  "memory_lesson_list",
  "memory_lesson_strengthen",
  "memory_insight_list",
  "memory_slot_list",
  "memory_slot_get",
  "memory_slot_create",
  "memory_slot_append",
  "memory_slot_replace",
  "memory_slot_delete",
  "memory_facet_tag",
  "memory_facet_query",
  "memory_team_share",
  "memory_team_feed",
  "memory_snapshot_create",
  "memory_reflect",
]);

const SERVER_INFO = {
  name: "agentmemory",
  version: VERSION,
  protocolVersion: "2024-11-05",
};

const kv = new InMemoryKV(getStandalonePersistPath());
let modeAnnounced = false;

function displayAgentmemoryUrl(): string {
  // Match the literal-placeholder guard in rest-proxy.ts so log lines
  // don't show `${AGENTMEMORY_URL}` when an MCP host passed the
  // placeholder through unexpanded.
  const raw = process.env["AGENTMEMORY_URL"];
  if (!raw || (raw.startsWith("${") && raw.endsWith("}"))) {
    return "http://localhost:3111";
  }
  return raw;
}

function announceMode(handle: Handle): void {
  if (modeAnnounced) return;
  modeAnnounced = true;
  if (handle.mode === "proxy") {
    process.stderr.write(
      `[@agentmemory/mcp] proxying to agentmemory server at ${handle.baseUrl}\n`,
    );
  } else {
    process.stderr.write(
      `[@agentmemory/mcp] no server reachable at ${displayAgentmemoryUrl()}; falling back to local InMemoryKV\n`,
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
  operation?: string;
  content?: string;
  type?: string;
  concepts?: string[];
  files?: string[];
  query?: string;
  limit?: number;
  format?: string;
  tokenBudget?: number;
  memoryIds?: string[];
  reason?: string;
  label?: string;
  text?: string;
  insightIds?: string[];
}

function validate(toolName: string, args: Record<string, unknown>): Validated {
  const v: Validated = { tool: toolName };
  switch (toolName) {
    case "memory_search":
    case "memory_recall":
    case "memory_smart_search":
    case "memory_timeline":
    case "memory_file_history":
    case "memory_graph_query":
    case "memory_vision_search": {
      const q = args["query"];
      if (typeof q !== "string" || !q.trim()) throw new Error("query is required");
      v.query = String(q).trim();
      v.limit = parseLimit(args["limit"]);
      v.operation = args["scope"] as string || args["operation"] as string || "keyword";
      const fmt = args["format"];
      if (typeof fmt === "string" && fmt.trim()) {
        v.format = fmt.trim().toLowerCase();
      }
      const budget = args["token_budget"];
      if (typeof budget === "number" && Number.isFinite(budget) && budget > 0) {
        v.tokenBudget = Math.floor(budget);
      } else if (typeof budget === "string" && budget.trim()) {
        const n = Number(budget);
        if (Number.isFinite(n) && n > 0) v.tokenBudget = Math.floor(n);
      }
      return v;
    }
    case "memory_store":
    case "memory_save":
    case "memory_compress_file":
    case "memory_export":
    case "memory_consolidate":
    case "memory_claude_bridge_sync":
    case "memory_mesh_sync": {
      const op = args["operation"] as string;
      v.operation = (typeof op === "string" && op.trim()) ? op.trim() : "save";
      if (v.operation === "save") {
        const c = args["content"];
        if (typeof c !== "string" || !c.trim()) throw new Error("content is required for save");
        v.content = c;
        v.type = (args["type"] as string) || "fact";
        v.concepts = normalizeList(args["concepts"]);
        v.files = normalizeList(args["files"]);
      }
      return v;
    }
    case "memory_governance_delete": {
      const ids = normalizeList(args["memoryIds"]);
      if (ids.length === 0) throw new Error("memoryIds is required");
      v.memoryIds = ids;
      v.reason = (args["reason"] as string) || "plugin skill request";
      return v;
    }
    case "memory_audit": {
      v.operation = "audit";
      v.limit = parseLimit(args["limit"], 50);
      return v;
    }
    case "memory_profile": {
      v.operation = "profile";
      return v;
    }
    case "memory_sessions": {
      v.operation = "sessions";
      v.limit = parseLimit(args["limit"], 20);
      return v;
    }
    case "memory_action_create":
    case "memory_action_update":
    case "memory_routine_run":
    case "memory_next":
    case "memory_frontier":
    case "memory_lease":
    case "memory_signal_send":
    case "memory_signal_read":
    case "memory_checkpoint":
    case "memory_sentinel_create":
    case "memory_sentinel_trigger":
    case "memory_sketch_create":
    case "memory_sketch_promote":
    case "memory_crystallize":
    case "memory_diagnose":
    case "memory_heal":
    case "memory_obsidian_export":
    case "memory_verify":
    case "memory_lesson_save":
    case "memory_lesson_recall":
    case "memory_lesson_list":
    case "memory_lesson_strengthen":
    case "memory_insight_list":
    case "memory_slot_list":
    case "memory_slot_get":
    case "memory_slot_create":
    case "memory_slot_append":
    case "memory_slot_replace":
    case "memory_slot_delete":
    case "memory_facet_tag":
    case "memory_facet_query":
    case "memory_team_share":
    case "memory_team_feed":
    case "memory_snapshot_create":
    case "memory_reflect":
    case "memory_relations":
    case "task":
    case "task_plan":
    case "signal":
    case "checkpoint":
    case "sketch":
    case "crystal":
    case "lesson":
    case "insight":
    case "slot": {
      const op = args["operation"];
      if (typeof op !== "string" || !op.trim()) {
        v.operation = toolName.replace(/^memory_/, "").replace(/^memory_/, "");
        return v;
      }
      v.operation = (op as string).trim();
      if (toolName === "slot" && (v.operation === "get" || v.operation === "delete")) {
        const lbl = args["label"];
        if (typeof lbl !== "string" || !lbl.trim()) throw new Error("label is required");
        v.label = lbl;
      }
      if (toolName === "insight" && v.operation === "delete") {
        v.insightIds = normalizeList(args["insightIds"]);
        if (v.insightIds.length === 0) throw new Error("insightIds is required for delete");
        v.reason = (args["reason"] as string) || "plugin request";
      }
      return v;
    }
    default: {
      throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}

async function handleProxy(
  v: Validated,
  handle: ProxyHandle,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  // Map all tools (consolidated + legacy aliases) to REST endpoints or MCP call
  switch (v.tool) {
    case "memory_search":
    case "memory_recall":
    case "memory_smart_search": {
      const scope = v.tool === "memory_recall"
        ? "recall"
        : v.tool === "memory_smart_search"
          ? "smart_search"
          : v.operation || "keyword";
      const endpoints: Record<string, string> = {
        keyword: "/agentmemory/smart-search",
        semantic: "/agentmemory/smart-search",
        recall: "/agentmemory/search",
        smart_search: "/agentmemory/smart-search",
      };
      const ep = endpoints[scope] || "/agentmemory/search";
      const body: Record<string, unknown> = {
        query: v.query,
        limit: v.limit,
      };
      if (v.tool === "memory_recall") body["format"] = v.format ?? "full";
      else if (v.format != null) body["format"] = v.format;
      if (v.tokenBudget != null) body["token_budget"] = v.tokenBudget;
      const result = await handle.call(ep, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return textResponse(result, true);
    }
    case "memory_store":
    case "memory_save": {
      if (v.operation === "save") {
        const result = await handle.call("/agentmemory/remember", {
          method: "POST",
          body: JSON.stringify({ content: v.content, type: v.type, concepts: v.concepts, files: v.files }),
        });
        return textResponse(result);
      }
      throw new Error(`Unsupported memory_store operation: ${v.operation}`);
    }
    case "memory_profile": {
      const result = await handle.call("/agentmemory/profile?project=" + encodeURIComponent(v.query || ""), { method: "GET" });
      return textResponse(result, true);
    }
    case "memory_sessions": {
      const result = await handle.call("/agentmemory/sessions?limit=" + (v.limit ?? 20), { method: "GET" });
      return textResponse(result, true);
    }
    case "memory_governance_delete": {
      const result = await handle.call("/agentmemory/governance/memories", {
        method: "DELETE",
        body: JSON.stringify({ memoryIds: v.memoryIds, reason: v.reason }),
      });
      return textResponse(result);
    }
    case "memory_export": {
      const result = await handle.call("/agentmemory/export", { method: "GET" });
      return textResponse(result, true);
    }
    case "memory_audit": {
      const result = await handle.call(
        `/agentmemory/audit?limit=${v.limit}`,
        { method: "GET" },
      );
      return textResponse(result, true);
    }
    default:
      throw new Error(`Proxy not implemented for: ${v.tool}`);
  }
}

async function handleLocal(
  v: Validated,
  kvInstance: InMemoryKV,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (v.tool) {
    case "memory_search":
    case "memory_recall":
    case "memory_smart_search": {
      const query = (v.query || "").toLowerCase();
      const limit = v.limit ?? DEFAULT_LIMIT;
      const all = await kvInstance.list<Record<string, unknown>>("mem:memories");
      const results = all
        .filter((m) => {
          const text = [typeof m["title"] === "string" ? m["title"] : "", typeof m["content"] === "string" ? m["content"] : "", Array.isArray(m["files"]) ? (m["files"] as string[]).join(" ") : "", Array.isArray(m["concepts"]) ? (m["concepts"] as string[]).join(" ") : ""].join(" ").toLowerCase();
          return query.split(/\s+/).every((word) => text.includes(word));
        })
        .slice(0, limit);
      return textResponse({ mode: "compact", results }, true);
    }
    case "memory_store":
    case "memory_save": {
      if (v.operation === "save") {
        const id = generateId("mem");
        const isoNow = new Date().toISOString();
        await kvInstance.set("mem:memories", id, {
          id, type: v.type, title: ((v.content || "") as string).slice(0, 80), content: v.content,
          concepts: v.concepts, files: v.files, createdAt: isoNow, updatedAt: isoNow,
          strength: 7, version: 1, isLatest: true, sessionIds: [],
        });
        kvInstance.persist();
        return textResponse({ saved: id });
      }
      throw new Error(`Unsupported operation: ${v.operation}`);
    }
    case "memory_profile": {
      throw new Error("memory_profile not implemented in standalone local mode");
    }
    case "memory_sessions": {
      const sessions = await kvInstance.list<Record<string, unknown>>("mem:sessions");
      return textResponse({ sessions: sessions.slice(0, (v.limit ?? 20) as number) }, true);
    }
    case "memory_governance_delete": {
      let deleted = 0;
      const now = new Date().toISOString();
      for (const id of v.memoryIds || []) {
        const existing = await kvInstance.get<Record<string, unknown>>("mem:memories", id);
        if (existing && existing["deleted"] !== true) {
          existing["deleted"] = true;
          existing["updatedAt"] = now;
          await kvInstance.set("mem:memories", id, existing);
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
        { entries: (entries as Array<Record<string, unknown>>).slice(0, limit) },
        true,
      );
    }
    default: {
      throw new Error(`Unknown tool: ${v.tool}`);
    }
  }
}

async function handleProxyGeneric(
  toolName: string,
  args: Record<string, unknown>,
  handle: ProxyHandle,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  // Forward to the server's full MCP surface so non-Claude clients can
  // reach all 15 consolidated tools (lessons, sentinels, slots, signals, graph, …)
  // instead of being capped at the IMPLEMENTED_TOOLS set baked into
  // this shim. The server validates arguments per tool.
  const result = (await handle.call("/agentmemory/mcp/call", {
    method: "POST",
    body: JSON.stringify({ name: toolName, arguments: args }),
  })) as { content?: Array<{ type: string; text: string }> } | null;
  if (result && Array.isArray(result.content)) {
    return { content: result.content };
  }
  return textResponse(result, true);
}

export async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  kvInstance: InMemoryKV = kv,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const handle = await resolveHandle();
  announceMode(handle);

  // Tools the local InMemoryKV fallback doesn't implement: forward straight
  // to the server. Local validation would otherwise raise "Unknown tool"
  // (issue #234).
  if (!IMPLEMENTED_TOOLS.has(toolName)) {
    if (handle.mode === "proxy") {
      try {
        return await handleProxyGeneric(toolName, args, handle);
      } catch (err) {
        process.stderr.write(
          `[@agentmemory/mcp] proxy call failed for ${toolName}: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        invalidateHandle();
        throw err;
      }
    }
    throw new Error(
      `Unknown tool: ${toolName} (local fallback supports only ${[...IMPLEMENTED_TOOLS].join(", ")}; start an agentmemory server and set AGENTMEMORY_URL to use the full tool set)`,
    );
  }

  const validated = validate(toolName, args);
  const localSet = new Set(["memory_search","memory_recall","memory_smart_search","memory_store","memory_save","memory_profile","memory_sessions"]);
  if (handle.mode === "proxy") {
    try {
      return await handleProxy(validated, handle);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!localSet.has(toolName) && (msg.startsWith("Proxy not implemented") || msg.startsWith("Unsupported"))) {
        try {
          return await handleProxyGeneric(toolName, args, handle);
        } catch {
          invalidateHandle();
          throw err;
        }
      }
      process.stderr.write(
        `[@agentmemory/mcp] proxy call failed for ${toolName}: ${msg}; invalidating handle and falling back to local KV\n`,
      );
      invalidateHandle();
      if (!localSet.has(toolName)) {
        throw err;
      }
    }
  }
  return handleLocal(validated, kvInstance);
}

export async function handleToolsList(): Promise<{ tools: unknown[] }> {
  const debug = process.env["AGENTMEMORY_DEBUG"] === "1" || process.env["AGENTMEMORY_DEBUG"] === "true";
  const handle = await resolveHandle();
  announceMode(handle);
  if (debug) {
    process.stderr.write(
      `[@agentmemory/mcp] tools/list: handle.mode=${handle.mode}${handle.mode === "proxy" ? ` baseUrl=${handle.baseUrl}` : ""}\n`,
    );
  }
  if (handle.mode === "proxy") {
    try {
      const remote = (await handle.call("/agentmemory/mcp/tools", {
        method: "GET",
      })) as { tools?: unknown } | null;
      if (debug) {
        const shape = remote === null
          ? "null"
          : typeof remote !== "object"
            ? typeof remote
            : `keys=${Object.keys(remote as object).join(",")} toolsType=${Array.isArray((remote as { tools?: unknown }).tools) ? `array(len=${((remote as { tools: unknown[] }).tools).length})` : typeof (remote as { tools?: unknown }).tools}`;
        process.stderr.write(
          `[@agentmemory/mcp] tools/list: remote response shape: ${shape}\n`,
        );
      }
      if (remote && Array.isArray(remote.tools)) {
        if (debug) {
          process.stderr.write(
            `[@agentmemory/mcp] tools/list: returning ${remote.tools.length} tools from server\n`,
          );
        }
        return { tools: remote.tools };
      }
      process.stderr.write(
        `[@agentmemory/mcp] tools/list: server returned unexpected shape (no .tools array); falling back to local IMPLEMENTED_TOOLS list. Set AGENTMEMORY_DEBUG=1 to inspect response.\n`,
      );
    } catch (err) {
      process.stderr.write(
        `[@agentmemory/mcp] tools/list proxy failed: ${err instanceof Error ? err.message : String(err)}; falling back to local list\n`,
      );
      invalidateHandle();
    }
  }
  const fallback = getAllTools().filter((t) => {
    const localSet = new Set(["memory_search", "memory_store"]);
    return localSet.has(t.name);
  });
  if (debug) {
    process.stderr.write(
      `[@agentmemory/mcp] tools/list: returning ${fallback.length} local fallback tools (${fallback.map((t) => t.name).join(",")})\n`,
    );
  }
  return { tools: fallback };
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

    case "tools/list":
      return handleToolsList();

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
