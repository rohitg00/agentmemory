#!/usr/bin/env node

import { InMemoryKV } from "./in-memory-kv.js";
import { createStdioTransport } from "./transport.js";
import { getAllTools } from "./tools-registry.js";
import { getAgentId, getStandalonePersistPath, isAgentScopeIsolated } from "../config.js";
import { isSearchLayer, type SearchLayer } from "../state/search-layer.js";
import { memoryToObservation } from "../state/memory-utils.js";
import { buildRecallResponse } from "../functions/recall-response.js";
import { parseSearchExpansionIds, type SearchExpansionId } from "./search-arguments.js";
import type { Memory, SearchResult, Session } from "../types.js";
import { VERSION } from "../version.js";
import { generateId } from "../state/schema.js";
import { queryAudit } from "../functions/audit.js";
import {
  resolveHandle,
  invalidateHandle,
  ProxyCallError,
  type Handle,
  type ProxyHandle,
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

const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
];

const SERVER_INFO = {
  name: "agentmemory",
  version: VERSION,
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
    const fullToolCount = getAllTools().length;
    process.stderr.write(
      `[@agentmemory/mcp] no server reachable at ${displayAgentmemoryUrl()}; running reduced LOCAL FALLBACK with ${IMPLEMENTED_TOOLS.size} of ${fullToolCount} tools. Start 'npx @agentmemory/agentmemory' (and point AGENTMEMORY_URL at it) to unlock all ${fullToolCount} tools.\n`,
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
  project?: string;
  agentId?: string;
  query?: string;
  limit?: number;
  format?: "full" | "compact" | "narrative";
  tokenBudget?: number;
  targetLayer?: SearchLayer;
  cwd?: string;
  expandIds?: SearchExpansionId[];
  sessionId?: string;
  source?: string;
  includeLessons?: boolean;
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
      // The tool schema exposes project (and now agentId); dropping them
      // here silently broke project/agent scoping through the stdio
      // package specifically.
      if (typeof args["project"] === "string" && args["project"].trim()) {
        v.project = args["project"].trim();
      }
      if (typeof args["agentId"] === "string" && args["agentId"].trim()) {
        v.agentId = args["agentId"].trim();
      }
      return v;
    }
    case "memory_recall":
    case "memory_smart_search": {
      if (args.targetLayer !== undefined && !isSearchLayer(args.targetLayer)) {
        throw new Error("targetLayer must be one of: all, memory, observation");
      }
      v.targetLayer = args.targetLayer ?? "all";
      for (const field of ["project", "cwd", "agentId", "sessionId", "source"] as const) {
        if (args[field] !== undefined && typeof args[field] !== "string") {
          throw new Error(`${field} must be a string`);
        }
        if (typeof args[field] === "string" && args[field].trim()) v[field] = args[field].trim();
      }
      if (toolName === "memory_smart_search") {
        v.expandIds = parseSearchExpansionIds(args.expandIds);
        if (typeof args.includeLessons === "boolean") v.includeLessons = args.includeLessons;
      }
      const query = args["query"];
      if (typeof query !== "string" || !query.trim()) {
        if (!v.expandIds?.length) throw new Error("query is required unless expandIds is provided");
      } else {
        v.query = query.trim();
      }
      v.limit = parseLimit(args["limit"]);
      if (toolName === "memory_recall") {
        const format = typeof args.format === "string" ? args.format.trim().toLowerCase() : args.format ?? "full";
        if (format !== "full" && format !== "compact" && format !== "narrative") {
          throw new Error("format must be one of: full, compact, narrative");
        }
        v.format = format;
        if (args.token_budget !== undefined) {
          const budget = typeof args.token_budget === "string" ? Number(args.token_budget) : args.token_budget;
          if (typeof budget !== "number" || !Number.isInteger(budget) || budget < 1) {
            throw new Error("token_budget must be a positive integer");
          }
          v.tokenBudget = budget;
        }
      }
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

async function handleProxy(
  v: Validated,
  handle: ProxyHandle,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (v.tool) {
    case "memory_save": {
      const result = await handle.call("/agentmemory/remember", {
        method: "POST",
        body: JSON.stringify({
          content: v.content,
          type: v.type,
          concepts: v.concepts,
          files: v.files,
          ...(v.project !== undefined && { project: v.project }),
          ...(v.agentId !== undefined && { agentId: v.agentId }),
        }),
      });
      return textResponse(result);
    }
    case "memory_recall": {
      const body: Record<string, unknown> = {
        query: v.query,
        limit: v.limit,
        format: v.format ?? "full",
        targetLayer: v.targetLayer,
        project: v.project,
        cwd: v.cwd,
        agentId: v.agentId,
      };
      if (v.tokenBudget != null) body["token_budget"] = v.tokenBudget;
      const result = await handle.call("/agentmemory/search", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return textResponse(result, true);
    }
    case "memory_smart_search": {
      const body: Record<string, unknown> = {
        query: v.query,
        limit: v.limit,
        targetLayer: v.targetLayer,
        project: v.project,
        agentId: v.agentId,
        expandIds: v.expandIds,
        sessionId: v.sessionId,
        source: v.source,
        includeLessons: v.includeLessons,
      };
      const result = await handle.call("/agentmemory/smart-search", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return textResponse(result, true);
    }
    case "memory_sessions": {
      const result = await handle.call(
        `/agentmemory/sessions?limit=${v.limit}`,
        { method: "GET" },
      );
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
      try {
        const result = await handle.call("/agentmemory/export", { method: "GET" });
        return textResponse(result, true);
      } catch (err) {
        if (
          err instanceof ProxyCallError &&
          err.body != null &&
          typeof err.body === "object" &&
          (err.body as { oversized?: boolean }).oversized === true
        ) {
          return textResponse(err.body, true);
        }
        throw err;
      }
    }
    case "memory_audit": {
      const result = await handle.call(
        `/agentmemory/audit?limit=${v.limit}`,
        { method: "GET" },
      );
      return textResponse(result, true);
    }
    default:
      throw new Error(`Unknown tool: ${v.tool}`);
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
        ...(v.project !== undefined && { project: v.project }),
        ...((v.agentId ?? getAgentId()) !== undefined && { agentId: v.agentId ?? getAgentId() }),
      });
      kvInstance.persist();
      return textResponse({ saved: id });
    }

    case "memory_recall":
    case "memory_smart_search": {
      const isolated = isAgentScopeIsolated();
      const agentId = v.agentId === "*" ? undefined : v.agentId ?? (isolated ? getAgentId() : undefined);
      if (isolated && v.agentId !== "*" && !agentId) {
        throw new Error("AGENTMEMORY_AGENT_SCOPE=isolated requires an agentId; pass '*' to read across agents");
      }
      const query = (v.query || "").toLowerCase();
      const limit = v.limit ?? DEFAULT_LIMIT;
      const all = v.targetLayer === "observation" ? [] : await kvInstance.list<Memory>("mem:memories");
      const sessions = v.project || v.cwd ? await kvInstance.list<Session>("mem:sessions") : [];
      const sessionsById = new Map(sessions.map((session) => [session.id, session]));
      const scoped = all.filter((memory) => {
        if (memory.isLatest === false || (agentId && memory.agentId !== agentId)) return false;
        const linkedSessions = (memory.sessionIds ?? []).map((id) => sessionsById.get(id));
        if (v.project && (memory.project ? memory.project !== v.project : !linkedSessions.some((session) => session?.project === v.project))) return false;
        if (v.cwd && !linkedSessions.some((session) => session?.cwd === v.cwd)) return false;
        return true;
      });
      if (v.tool === "memory_smart_search" && v.expandIds?.length) {
        const ids = v.expandIds.map((entry) => typeof entry === "string" ? entry : entry.obsId);
        const byId = new Map(scoped.map((memory) => [memory.id, memory]));
        const eligible = ids.filter((id) => byId.has(id));
        const results = eligible.slice(0, 20).map((id) => {
          const observation = memoryToObservation(byId.get(id)!);
          return { obsId: id, sessionId: observation.sessionId, observation, layer: "memory" };
        });
        return textResponse({ mode: "expanded", results, truncated: eligible.length > 20 }, true);
      }
      const results = scoped.filter((memory) => {
        const text = [memory.title, memory.content, ...(memory.files ?? []), ...(memory.concepts ?? []), ...(memory.sessionIds ?? []), memory.id]
          .join(" ").toLowerCase();
        return query.split(/\s+/).every((word) => text.includes(word));
      }).slice(0, limit);
      if (v.tool === "memory_recall") {
        const matches: SearchResult[] = results.map((memory) => {
          const observation = memoryToObservation(memory);
          return { sessionId: observation.sessionId, observation, score: 1, layer: "memory" };
        });
        return textResponse(buildRecallResponse(matches, v.format ?? "full", v.tokenBudget), true);
      }
      return textResponse({ mode: "compact", results: results.map((memory) => ({
        ...memory, obsId: memory.id, sessionId: memory.sessionIds?.[0] ?? "memory", layer: "memory",
      })) }, true);
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
      const result = await queryAudit(kvInstance as never, {
        limit: v.limit ?? 50,
      });
      return textResponse(result, true);
    }

    default:
      throw new Error(`Unknown tool: ${v.tool}`);
  }
}

async function handleProxyGeneric(
  toolName: string,
  args: Record<string, unknown>,
  handle: ProxyHandle,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  // Forward to the server's full MCP surface so non-Claude clients can
  // reach all 54 tools (lessons, sentinels, slots, signals, graph, …)
  // instead of being capped at the 7 IMPLEMENTED_TOOLS set baked into
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
  if (handle.mode === "proxy") {
    try {
      return await handleProxy(validated, handle);
    } catch (err) {
      process.stderr.write(
        `[@agentmemory/mcp] proxy call failed for ${toolName}: ${err instanceof Error ? err.message : String(err)}; invalidating handle and falling back to local KV\n`,
      );
      invalidateHandle();
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
  const fallback = getAllTools().filter((t) => IMPLEMENTED_TOOLS.has(t.name));
  if (debug) {
    process.stderr.write(
      `[@agentmemory/mcp] tools/list: returning ${fallback.length} local fallback tools (${fallback.map((t) => t.name).join(",")})\n`,
    );
  }
  return { tools: fallback };
}

const transport = createStdioTransport(async (method, params) => {
  switch (method) {
    case "initialize": {
      const requested = (params as { protocolVersion?: unknown } | undefined)
        ?.protocolVersion;
      const protocolVersion =
        typeof requested === "string" &&
        SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : SUPPORTED_PROTOCOL_VERSIONS[0];
      return {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: SERVER_INFO.name,
          version: SERVER_INFO.version,
        },
      };
    }

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
