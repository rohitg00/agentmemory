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

const MCP_RESOURCE_TEMPLATES = MCP_RESOURCES.filter((r) =>
  r.uri.includes("{"),
).map((r) => ({
  uriTemplate: r.uri,
  name: r.name,
  description: r.description,
  mimeType: r.mimeType,
}));

const MCP_PROMPTS = [
  {
    name: "recall_context",
    description: "Search observations and memories to build context for a task",
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
    description: "Generate a handoff summary for continuing work in a new session",
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

function resourceContents(uri: string, payload: unknown): {
  contents: Array<{ uri: string; mimeType: string; text: string }>;
} {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(payload),
      },
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resourceTemplatesFromResources(resources: unknown[]): unknown[] {
  return resources
    .filter((resource): resource is Record<string, unknown> => {
      return isRecord(resource) &&
        typeof resource["uri"] === "string" &&
        resource["uri"].includes("{");
    })
    .map((resource) => ({
      uriTemplate: resource["uri"],
      name: resource["name"],
      description: resource["description"],
      mimeType: resource["mimeType"],
    }));
}

function decodeUriComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error("Invalid percent-encoding in URI");
  }
}

function promptMessage(text: string): {
  messages: Array<{ role: string; content: { type: string; text: string } }>;
} {
  return {
    messages: [
      {
        role: "user",
        content: { type: "text", text },
      },
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
  format?: string;
  tokenBudget?: number;
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
        }),
      });
      return textResponse(result);
    }
    case "memory_recall": {
      const body: Record<string, unknown> = {
        query: v.query,
        limit: v.limit,
        format: v.format ?? "full",
      };
      if (v.tokenBudget != null) body["token_budget"] = v.tokenBudget;
      const result = await handle.call("/agentmemory/search", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return textResponse(result, true);
    }
    case "memory_smart_search": {
      const body: Record<string, unknown> = { query: v.query, limit: v.limit };
      if (v.format != null) body["format"] = v.format;
      if (v.tokenBudget != null) body["token_budget"] = v.tokenBudget;
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

export async function handleResourcesList(): Promise<{ resources: unknown[] }> {
  const handle = await resolveHandle();
  announceMode(handle);
  if (handle.mode === "proxy") {
    try {
      const remote = (await handle.call("/agentmemory/mcp/resources", {
        method: "GET",
      })) as { resources?: unknown } | null;
      if (remote && Array.isArray(remote.resources)) {
        return { resources: remote.resources };
      }
      process.stderr.write(
        "[@agentmemory/mcp] resources/list: server returned unexpected shape; falling back to local resource list\n",
      );
    } catch (err) {
      process.stderr.write(
        `[@agentmemory/mcp] resources/list proxy failed: ${err instanceof Error ? err.message : String(err)}; falling back to local resource list\n`,
      );
      invalidateHandle();
    }
  }
  return { resources: MCP_RESOURCES };
}

export async function handleResourceTemplatesList(): Promise<{
  resourceTemplates: unknown[];
}> {
  const handle = await resolveHandle();
  announceMode(handle);
  if (handle.mode === "proxy") {
    try {
      const remote = (await handle.call("/agentmemory/mcp/resources", {
        method: "GET",
      })) as { resources?: unknown } | null;
      if (remote && Array.isArray(remote.resources)) {
        return {
          resourceTemplates: resourceTemplatesFromResources(remote.resources),
        };
      }
      process.stderr.write(
        "[@agentmemory/mcp] resources/templates/list: server returned unexpected resource shape; falling back to local resource templates\n",
      );
    } catch (err) {
      process.stderr.write(
        `[@agentmemory/mcp] resources/templates/list proxy failed: ${err instanceof Error ? err.message : String(err)}; falling back to local resource templates\n`,
      );
      invalidateHandle();
    }
  }
  return { resourceTemplates: MCP_RESOURCE_TEMPLATES };
}

async function handleLocalResourceRead(
  uri: string,
  kvInstance: InMemoryKV,
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  if (uri === "agentmemory://status") {
    const [sessions, memories, healthData] = await Promise.all([
      kvInstance.list<Record<string, unknown>>("mem:sessions"),
      kvInstance.list<Record<string, unknown>>("mem:memories"),
      kvInstance.list<Record<string, unknown>>("mem:health").catch(() => []),
    ]);
    return resourceContents(uri, {
      sessionCount: sessions.length,
      memoryCount: memories.length,
      healthStatus: healthData.length > 0 ? "available" : "no-data",
    });
  }

  const projectProfileMatch = uri.match(
    /^agentmemory:\/\/project\/(.+)\/profile$/,
  );
  if (projectProfileMatch) {
    const project = decodeUriComponent(projectProfileMatch[1]);
    return resourceContents(uri, {
      project,
      topConcepts: [],
      frequentFiles: [],
      conventions: [],
      mode: "local-fallback",
    });
  }

  const projectRecentMatch = uri.match(
    /^agentmemory:\/\/project\/(.+)\/recent$/,
  );
  if (projectRecentMatch) {
    const project = decodeUriComponent(projectRecentMatch[1]);
    const summaries =
      await kvInstance.list<Record<string, unknown>>("mem:summaries");
    const filtered = summaries
      .filter((s) => s["project"] === project)
      .sort((a, b) => {
        const left = String(a["createdAt"] || "");
        const right = String(b["createdAt"] || "");
        return new Date(right).getTime() - new Date(left).getTime();
      })
      .slice(0, 5);
    return resourceContents(uri, filtered);
  }

  if (uri === "agentmemory://memories/latest") {
    const memories =
      await kvInstance.list<Record<string, unknown>>("mem:memories");
    const latest = memories
      .filter((m) => m["isLatest"] !== false)
      .sort((a, b) => {
        const left = String(a["updatedAt"] || a["createdAt"] || "");
        const right = String(b["updatedAt"] || b["createdAt"] || "");
        return new Date(right).getTime() - new Date(left).getTime();
      })
      .slice(0, 10)
      .map((m) => ({
        id: m["id"],
        title: m["title"],
        type: m["type"],
        strength: m["strength"],
      }));
    return resourceContents(uri, latest);
  }

  if (uri === "agentmemory://graph/stats") {
    return resourceContents(uri, {
      totalNodes: 0,
      totalEdges: 0,
      nodesByType: {},
      edgesByType: {},
      mode: "local-fallback",
    });
  }

  const teamProfileMatch = uri.match(/^agentmemory:\/\/team\/(.+)\/profile$/);
  if (teamProfileMatch) {
    const teamId = decodeUriComponent(teamProfileMatch[1]);
    return resourceContents(uri, {
      teamId,
      sharedItems: 0,
      mode: "local-fallback",
    });
  }

  throw new Error(`Unknown resource: ${uri}`);
}

export async function handleResourceRead(
  uri: string,
  kvInstance: InMemoryKV = kv,
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  if (typeof uri !== "string" || !uri.trim()) {
    throw new Error("uri is required");
  }

  const handle = await resolveHandle();
  announceMode(handle);
  if (handle.mode === "proxy") {
    try {
      const remote = (await handle.call("/agentmemory/mcp/resources/read", {
        method: "POST",
        body: JSON.stringify({ uri }),
      })) as { contents?: unknown } | null;
      if (remote && Array.isArray(remote.contents)) {
        return remote as {
          contents: Array<{ uri: string; mimeType: string; text: string }>;
        };
      }
      process.stderr.write(
        "[@agentmemory/mcp] resources/read: server returned unexpected shape; falling back to local resource reader\n",
      );
    } catch (err) {
      process.stderr.write(
        `[@agentmemory/mcp] resources/read proxy failed: ${err instanceof Error ? err.message : String(err)}; falling back to local resource reader\n`,
      );
      invalidateHandle();
    }
  }
  return handleLocalResourceRead(uri, kvInstance);
}

export async function handlePromptsList(): Promise<{ prompts: unknown[] }> {
  const handle = await resolveHandle();
  announceMode(handle);
  if (handle.mode === "proxy") {
    try {
      const remote = (await handle.call("/agentmemory/mcp/prompts", {
        method: "GET",
      })) as { prompts?: unknown } | null;
      if (remote && Array.isArray(remote.prompts)) {
        return { prompts: remote.prompts };
      }
      process.stderr.write(
        "[@agentmemory/mcp] prompts/list: server returned unexpected shape; falling back to local prompt list\n",
      );
    } catch (err) {
      process.stderr.write(
        `[@agentmemory/mcp] prompts/list proxy failed: ${err instanceof Error ? err.message : String(err)}; falling back to local prompt list\n`,
      );
      invalidateHandle();
    }
  }
  return { prompts: MCP_PROMPTS };
}

async function handleLocalPromptGet(
  name: string,
  args: Record<string, unknown>,
  kvInstance: InMemoryKV,
): Promise<{
  messages: Array<{ role: string; content: { type: string; text: string } }>;
}> {
  switch (name) {
    case "recall_context": {
      const taskDesc = args["task_description"];
      if (typeof taskDesc !== "string" || !taskDesc.trim()) {
        throw new Error("task_description argument is required and must be a string");
      }
      const memories =
        await kvInstance.list<Record<string, unknown>>("mem:memories");
      const query = taskDesc.toLowerCase();
      const relevant = memories
        .filter((m) =>
          [
            m["title"],
            m["content"],
            Array.isArray(m["concepts"]) ? m["concepts"].join(" ") : "",
            Array.isArray(m["files"]) ? m["files"].join(" ") : "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(query),
        )
        .slice(0, 5);
      return promptMessage(
        `Here is relevant context from local agentmemory fallback for the task: "${taskDesc}"\n\n## Relevant Memories\n${JSON.stringify(relevant, null, 2)}`,
      );
    }

    case "session_handoff": {
      const sessionId = args["session_id"];
      if (typeof sessionId !== "string" || !sessionId.trim()) {
        throw new Error("session_id argument is required and must be a string");
      }
      const session = await kvInstance.get("mem:sessions", sessionId);
      const summaries =
        await kvInstance.list<Record<string, unknown>>("mem:summaries");
      const summary = summaries.find((s) => s["sessionId"] === sessionId);
      return promptMessage(
        `## Session Handoff\n\n### Session\n${JSON.stringify(session, null, 2)}\n\n### Summary\n${JSON.stringify(summary || "No summary available", null, 2)}`,
      );
    }

    case "detect_patterns": {
      if (args["project"] !== undefined && typeof args["project"] !== "string") {
        throw new Error("project argument must be a string");
      }
      return promptMessage(
        `## Pattern Analysis\n\n${JSON.stringify(
          {
            project: args["project"],
            fileCoOccurrence: [],
            concepts: [],
            mode: "local-fallback",
          },
          null,
          2,
        )}`,
      );
    }

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}

export async function handlePromptGet(
  name: string,
  args: Record<string, unknown> = {},
  kvInstance: InMemoryKV = kv,
): Promise<{
  messages: Array<{ role: string; content: { type: string; text: string } }>;
}> {
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("name is required");
  }

  const handle = await resolveHandle();
  announceMode(handle);
  if (handle.mode === "proxy") {
    try {
      const remote = (await handle.call("/agentmemory/mcp/prompts/get", {
        method: "POST",
        body: JSON.stringify({ name, arguments: args }),
      })) as { messages?: unknown } | null;
      if (remote && Array.isArray(remote.messages)) {
        return remote as {
          messages: Array<{
            role: string;
            content: { type: string; text: string };
          }>;
        };
      }
      process.stderr.write(
        "[@agentmemory/mcp] prompts/get: server returned unexpected shape; falling back to local prompt handler\n",
      );
    } catch (err) {
      process.stderr.write(
        `[@agentmemory/mcp] prompts/get proxy failed: ${err instanceof Error ? err.message : String(err)}; falling back to local prompt handler\n`,
      );
      invalidateHandle();
    }
  }
  return handleLocalPromptGet(name, args, kvInstance);
}

const transport = createStdioTransport(async (method, params) => {
  const requestParams = isRecord(params) ? params : {};
  switch (method) {
    case "initialize":
      return {
        protocolVersion: SERVER_INFO.protocolVersion,
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false },
          prompts: { listChanged: false },
        },
        serverInfo: {
          name: SERVER_INFO.name,
          version: SERVER_INFO.version,
        },
      };

    case "notifications/initialized":
      return {};

    case "tools/list":
      return handleToolsList();

    case "resources/list":
      return handleResourcesList();

    case "resources/templates/list":
      return handleResourceTemplatesList();

    case "resources/read":
      return handleResourceRead(requestParams["uri"] as string);

    case "prompts/list":
      return handlePromptsList();

    case "prompts/get":
      return handlePromptGet(
        requestParams["name"] as string,
        isRecord(requestParams["arguments"]) ? requestParams["arguments"] : {},
      );

    case "tools/call": {
      const toolName = requestParams["name"] as string;
      const toolArgs = isRecord(requestParams["arguments"])
        ? requestParams["arguments"]
        : {};
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
