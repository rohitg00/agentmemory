import type { HttpRequest } from "@iii-dev/helpers/http";
import { readHeader } from "../auth.js";
import { checkAuth } from "../triggers/api.js";
import { VERSION } from "../version.js";

export const MCP_HTTP_PATH = "/agentmemory/mcp";
export const MODERN_PROTOCOL_VERSIONS = ["2026-07-28"];
export const LEGACY_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

const SUPPORTED_PROTOCOL_VERSIONS = [...MODERN_PROTOCOL_VERSIONS, ...LEGACY_PROTOCOL_VERSIONS];
const SERVER_INFO = { name: "agentmemory", version: VERSION };

const META_PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_CLIENT_CAPABILITIES = "io.modelcontextprotocol/clientCapabilities";
const META_SERVER_INFO = "io.modelcontextprotocol/serverInfo";

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;
const LEGACY_RESOURCE_NOT_FOUND = -32002;
const HEADER_MISMATCH = -32020;
const UNSUPPORTED_PROTOCOL_VERSION = -32022;

const LIST_TTL_MS = 300_000;
const ECHO_LIMIT = 128;
const BASE64_HEADER = /^=\?base64\?([A-Za-z0-9+/]*={0,2})\?=$/;

const NAME_FIELDS = new Map<string, "name" | "uri">([
  ["tools/call", "name"],
  ["prompts/get", "name"],
  ["resources/read", "uri"],
]);

type JsonObject = Record<string, unknown>;
type CacheHint = { ttlMs: number; cacheScope: "public" | "private" };

export type McpHttpResponse = {
  status_code: number;
  headers?: Record<string, string>;
  body?: unknown;
};

type RestHandler = (req: HttpRequest<never>) => Promise<McpHttpResponse>;

export type McpHttpDeps = {
  secret?: string;
  isKnownTool: (name: string) => boolean;
  rest: Record<
    "listTools" | "callTool" | "listResources" | "readResource" | "listPrompts" | "getPrompt",
    RestHandler
  >;
};

type Failure = { ok: false; status: number; code: number; message: string; data?: unknown };
type Success = { ok: true; result: JsonObject; cache?: CacheHint };
type Outcome = Success | Failure;

type Call = {
  req: HttpRequest;
  method: string;
  params: JsonObject;
  modern: boolean;
};

const ACCEPTED: McpHttpResponse = { status_code: 202, headers: { "Content-Type": "text/plain" }, body: "" };
const PUBLIC_LIST: CacheHint = { ttlMs: LIST_TTL_MS, cacheScope: "public" };
const PRIVATE_LIVE: CacheHint = { ttlMs: 0, cacheScope: "private" };

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clip(value: string): string {
  return value.length > ECHO_LIMIT ? `${value.slice(0, ECHO_LIMIT)}...` : value;
}

function succeed(result: JsonObject, cache?: CacheHint): Success {
  return { ok: true, result, cache };
}

function fail(code: number, message: string, status = 200, data?: unknown): Failure {
  return { ok: false, status, code, message, data };
}

function headerMismatch(header: string, received: string, expected: string): Failure {
  return fail(
    HEADER_MISMATCH,
    `Header mismatch: ${header} header value '${clip(received)}' does not match body value '${clip(expected)}'`,
    400,
  );
}

function missingHeader(header: string): Failure {
  return fail(HEADER_MISMATCH, `Missing required header ${header}`, 400);
}

function unsupportedVersion(requested: string): Failure {
  return fail(UNSUPPORTED_PROTOCOL_VERSION, "Unsupported protocol version", 400, {
    supported: SUPPORTED_PROTOCOL_VERSIONS,
    requested: clip(requested),
  });
}

function decodeHeaderValue(value: string): string | null {
  if (!value.startsWith("=?base64?") || !value.endsWith("?=")) return value;
  const match = BASE64_HEADER.exec(value);
  return match ? Buffer.from(match[1]!, "base64").toString("utf8") : null;
}

function parseMessage(body: unknown): unknown {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function errorText(body: unknown): string {
  if (!isObject(body) || typeof body["error"] !== "string") return JSON.stringify(body ?? null);
  const hint = body["enableHow"];
  return typeof hint === "string" ? `${body["error"]}. ${hint}` : body["error"];
}

function restFailure(res: McpHttpResponse): Failure {
  if (res.status_code === 500) return fail(INTERNAL_ERROR, "Internal error");
  return fail(INVALID_PARAMS, errorText(res.body));
}

function isSuccess(res: McpHttpResponse): boolean {
  return res.status_code >= 200 && res.status_code < 300;
}

function validateModernEnvelope(call: Call, meta: JsonObject, headerVersion: string | undefined): Failure | null {
  const metaVersion = meta[META_PROTOCOL_VERSION];
  if (typeof metaVersion !== "string") {
    if (headerVersion !== undefined && !MODERN_PROTOCOL_VERSIONS.includes(headerVersion)) {
      return unsupportedVersion(headerVersion);
    }
    return fail(INVALID_PARAMS, `Missing required _meta field ${META_PROTOCOL_VERSION}`, 400);
  }
  if (headerVersion === undefined) return missingHeader("MCP-Protocol-Version");
  if (headerVersion !== metaVersion) return headerMismatch("MCP-Protocol-Version", headerVersion, metaVersion);
  if (!MODERN_PROTOCOL_VERSIONS.includes(metaVersion)) return unsupportedVersion(metaVersion);

  const headerMethod = readHeader(call.req.headers, "mcp-method");
  if (headerMethod === undefined) return missingHeader("Mcp-Method");
  if (headerMethod !== call.method) return headerMismatch("Mcp-Method", headerMethod, call.method);

  if (!isObject(meta[META_CLIENT_CAPABILITIES])) {
    return fail(INVALID_PARAMS, `Missing required _meta field ${META_CLIENT_CAPABILITIES}`, 400);
  }

  const field = NAME_FIELDS.get(call.method);
  const expected = field ? call.params[field] : undefined;
  if (typeof expected !== "string") return null;
  const rawName = readHeader(call.req.headers, "mcp-name");
  if (rawName === undefined) return missingHeader("Mcp-Name");
  const name = decodeHeaderValue(rawName);
  if (name === null) return fail(HEADER_MISMATCH, "Malformed Mcp-Name header: invalid Base64 value", 400);
  return name === expected ? null : headerMismatch("Mcp-Name", name, expected);
}

function initializeResult(params: JsonObject): JsonObject {
  const requested = params["protocolVersion"];
  const protocolVersion =
    typeof requested === "string" && LEGACY_PROTOCOL_VERSIONS.includes(requested)
      ? requested
      : LEGACY_PROTOCOL_VERSIONS[0];
  return {
    protocolVersion,
    capabilities: {
      tools: { listChanged: false },
      resources: { subscribe: false, listChanged: false },
      prompts: { listChanged: false },
    },
    serverInfo: SERVER_INFO,
  };
}

function discoverResult(): JsonObject {
  return {
    supportedVersions: SUPPORTED_PROTOCOL_VERSIONS,
    capabilities: { tools: {}, resources: {}, prompts: {} },
  };
}

async function dispatch(deps: McpHttpDeps, call: Call): Promise<Outcome> {
  const { req, method, params, modern } = call;
  const rest = (handler: RestHandler, body?: unknown) =>
    handler({ ...req, body } as HttpRequest<never>);
  const list = async (handler: RestHandler): Promise<Outcome> => {
    const res = await rest(handler);
    return isSuccess(res) && isObject(res.body) ? succeed(res.body, PUBLIC_LIST) : restFailure(res);
  };

  switch (method) {
    case "server/discover":
      return succeed(discoverResult(), PUBLIC_LIST);
    case "initialize":
      if (modern) break;
      return succeed(initializeResult(params));
    case "ping":
      if (modern) break;
      return succeed({});
    case "tools/list":
      return list(deps.rest.listTools);
    case "resources/list":
      return list(deps.rest.listResources);
    case "prompts/list":
      return list(deps.rest.listPrompts);
    case "resources/templates/list":
      return succeed({ resourceTemplates: [] }, PUBLIC_LIST);
    case "tools/call": {
      const name = params["name"];
      if (typeof name !== "string" || !name) return fail(INVALID_PARAMS, "name is required");
      const args = params["arguments"] ?? {};
      if (!isObject(args)) return fail(INVALID_PARAMS, "arguments must be an object");
      if (!deps.isKnownTool(name)) return fail(INVALID_PARAMS, `Unknown tool: ${clip(name)}`);
      const res = await rest(deps.rest.callTool, { name, arguments: args });
      if (res.status_code === 500) return fail(INTERNAL_ERROR, "Internal error");
      if (!isSuccess(res)) {
        return succeed({ content: [{ type: "text", text: errorText(res.body) }], isError: true });
      }
      const body = isObject(res.body) ? res.body : {};
      const content = Array.isArray(body["content"])
        ? body["content"]
        : [{ type: "text", text: JSON.stringify(res.body ?? null) }];
      return succeed({ content, isError: body["isError"] === true });
    }
    case "resources/read": {
      const uri = params["uri"];
      if (typeof uri !== "string" || !uri) return fail(INVALID_PARAMS, "uri is required");
      const res = await rest(deps.rest.readResource, { uri });
      if (isSuccess(res) && isObject(res.body)) return succeed(res.body, PRIVATE_LIVE);
      if (res.status_code !== 404) return restFailure(res);
      return fail(modern ? INVALID_PARAMS : LEGACY_RESOURCE_NOT_FOUND, "Resource not found", 200, {
        uri: clip(uri),
      });
    }
    case "prompts/get": {
      const name = params["name"];
      if (typeof name !== "string" || !name) return fail(INVALID_PARAMS, "name is required");
      const args = params["arguments"] ?? {};
      if (!isObject(args)) return fail(INVALID_PARAMS, "arguments must be an object");
      const res = await rest(deps.rest.getPrompt, { name, arguments: args });
      return isSuccess(res) && isObject(res.body) ? succeed(res.body) : restFailure(res);
    }
  }
  return fail(METHOD_NOT_FOUND, `Method not found: ${clip(method)}`, modern ? 404 : 200);
}

function errorResponse(id: string | number | undefined, failure: Failure): McpHttpResponse {
  const error: JsonObject = { code: failure.code, message: failure.message };
  if (failure.data !== undefined) error["data"] = failure.data;
  const body: JsonObject = { jsonrpc: "2.0", error };
  if (id !== undefined) body["id"] = id;
  return { status_code: failure.status, body };
}

function resultResponse(id: string | number, success: Success, modern: boolean): McpHttpResponse {
  if (!modern) return { status_code: 200, body: { jsonrpc: "2.0", id, result: success.result } };
  const ownMeta = isObject(success.result["_meta"]) ? success.result["_meta"] : {};
  const result = {
    resultType: "complete",
    ...success.result,
    ...success.cache,
    _meta: { ...ownMeta, [META_SERVER_INFO]: SERVER_INFO },
  };
  return { status_code: 200, body: { jsonrpc: "2.0", id, result } };
}

export function createMcpHttpHandler(deps: McpHttpDeps): (req: HttpRequest) => Promise<McpHttpResponse> {
  return async (req) => {
    const rejected = checkAuth(req, deps.secret);
    if (rejected) {
      if (rejected.status_code !== 401) return rejected;
      return { ...rejected, headers: { ...rejected.headers, "WWW-Authenticate": 'Bearer realm="agentmemory"' } };
    }
    if ((req.method || "POST").toUpperCase() !== "POST") {
      return {
        ...errorResponse(undefined, fail(INVALID_REQUEST, "Method not allowed: the MCP endpoint accepts POST only", 405)),
        headers: { Allow: "POST" },
      };
    }

    const message = parseMessage(req.body);
    if (message === undefined || message === null) {
      return errorResponse(undefined, fail(PARSE_ERROR, "Parse error", 400));
    }
    if (Array.isArray(message)) {
      return errorResponse(undefined, fail(INVALID_REQUEST, "Batch requests are not supported", 400));
    }
    if (!isObject(message) || message["jsonrpc"] !== "2.0") {
      return errorResponse(undefined, fail(INVALID_REQUEST, "Invalid JSON-RPC message", 400));
    }

    const hasId = "id" in message;
    const method = message["method"];
    if (typeof method !== "string") {
      const isClientResponse = hasId && ("result" in message || "error" in message);
      if (isClientResponse) return ACCEPTED;
      return errorResponse(undefined, fail(INVALID_REQUEST, "Invalid JSON-RPC message: method is required", 400));
    }
    if (!hasId) return ACCEPTED;

    const id = message["id"];
    if (typeof id !== "string" && !(typeof id === "number" && Number.isInteger(id))) {
      return errorResponse(undefined, fail(INVALID_REQUEST, "Invalid JSON-RPC message: id must be a string or an integer", 400));
    }
    const rawParams = message["params"];
    if (rawParams !== undefined && !isObject(rawParams)) {
      return errorResponse(id, fail(INVALID_PARAMS, "params must be an object", 400));
    }

    const params = rawParams ?? {};
    const meta = isObject(params["_meta"]) ? params["_meta"] : {};
    const headerVersion = readHeader(req.headers, "mcp-protocol-version");
    const modern =
      META_PROTOCOL_VERSION in meta ||
      method === "server/discover" ||
      (headerVersion !== undefined && !LEGACY_PROTOCOL_VERSIONS.includes(headerVersion));
    const call: Call = { req, method, params, modern };

    if (modern) {
      const invalid = validateModernEnvelope(call, meta, headerVersion);
      if (invalid) return errorResponse(id, invalid);
    }

    let outcome: Outcome;
    try {
      outcome = await dispatch(deps, call);
    } catch {
      outcome = fail(INTERNAL_ERROR, "Internal error");
    }
    return outcome.ok ? resultResponse(id, outcome, modern) : errorResponse(id, outcome);
  };
}
