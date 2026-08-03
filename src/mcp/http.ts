#!/usr/bin/env node

import {
  createServer as createNodeServer,
  type IncomingMessage,
  type Server as NodeServer,
  type ServerResponse,
} from "node:http";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { timingSafeCompare } from "../auth.js";
import { VERSION } from "../version.js";
import {
  callerIdentityHeaders,
  resolveEnvOrEmpty,
} from "./rest-proxy.js";
import { upstreamHttpError } from "./http-error.js";
import { createPlaintextCredentialGuard } from "./plaintext-credential.js";

const DEFAULT_ENGINE_URL = "http://127.0.0.1:3111";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3114;
const BACKEND_TIMEOUT_MS = 15_000;

export interface McpHttpBackend {
  health: () => Promise<boolean>;
  listTools: () => Promise<{ tools: Tool[] }>;
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<CallToolResult>;
}

export interface McpHttpOptions {
  host?: string;
  port?: number;
  path?: string;
  token?: string;
  allowedOrigins?: string[];
  allowRemote?: boolean;
  backend?: McpHttpBackend;
}

function positivePort(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535
    ? parsed
    : fallback;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

function isWildcardHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "0.0.0.0" || normalized === "::";
}

function parseAllowedOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function normalizeOptions(options: McpHttpOptions = {}): Required<
  Omit<McpHttpOptions, "backend">
> & { backend: McpHttpBackend } {
  const host = options.host ?? (
    resolveEnvOrEmpty("AGENTMEMORY_MCP_HTTP_HOST") || DEFAULT_HOST
  );
  const port = options.port ?? positivePort(
    resolveEnvOrEmpty("AGENTMEMORY_MCP_HTTP_PORT"),
    DEFAULT_PORT,
  );
  const token = options.token ?? resolveEnvOrEmpty("AGENTMEMORY_MCP_HTTP_TOKEN");
  const allowedOrigins = options.allowedOrigins ?? parseAllowedOrigins(
    resolveEnvOrEmpty("AGENTMEMORY_MCP_HTTP_ALLOWED_ORIGINS"),
  );
  const allowRemote = options.allowRemote ?? ["1", "true"].includes(
    resolveEnvOrEmpty("AGENTMEMORY_MCP_HTTP_ALLOW_REMOTE").toLowerCase(),
  );

  if (!isLoopbackHost(host) && (!allowRemote || !token)) {
    throw new Error(
      "Non-loopback MCP HTTP binds require AGENTMEMORY_MCP_HTTP_ALLOW_REMOTE=1 and a bearer token",
    );
  }

  return {
    host,
    port,
    path: options.path ?? "/mcp",
    token,
    allowedOrigins,
    allowRemote,
    backend: options.backend ?? createProxyBackend(),
  };
}

function engineHeaders(): Record<string, string> {
  const secret = resolveEnvOrEmpty("AGENTMEMORY_SECRET");
  return {
    "content-type": "application/json",
    ...(secret ? { authorization: `Bearer ${secret}` } : {}),
    ...callerIdentityHeaders(),
  };
}

function outboundCredential(): string {
  return (
    resolveEnvOrEmpty("AGENTMEMORY_SECRET") ||
    resolveEnvOrEmpty("AGENTMEMORY_CALLER_TOKEN")
  );
}

export function createProxyBackend(options: {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
} = {}): McpHttpBackend {
  const baseUrl = (
    options.baseUrl ?? (
      resolveEnvOrEmpty("AGENTMEMORY_URL") || DEFAULT_ENGINE_URL
    )
  ).replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const guardPlaintextCredential = createPlaintextCredentialGuard();
  const guardBackendRequest = () => {
    guardPlaintextCredential(baseUrl, outboundCredential());
  };

  if (resolveEnvOrEmpty("AGENTMEMORY_REQUIRE_HTTPS") === "1") {
    guardBackendRequest();
  }

  async function request(path: string, init: RequestInit): Promise<unknown> {
    guardBackendRequest();
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), ...engineHeaders() },
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw await upstreamHttpError(
        init.method ?? "GET",
        path,
        response,
      );
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    async health() {
      guardBackendRequest();
      try {
        const response = await fetchImpl(`${baseUrl}/agentmemory/livez`, {
          method: "GET",
          headers: engineHeaders(),
          signal: AbortSignal.timeout(2_000),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    async listTools() {
      const result = await request("/agentmemory/mcp/tools", { method: "GET" });
      if (
        !result ||
        typeof result !== "object" ||
        !Array.isArray((result as { tools?: unknown }).tools)
      ) {
        throw new Error("AgentMemory returned an invalid tools/list payload");
      }
      return { tools: (result as { tools: Tool[] }).tools };
    },
    async callTool(name, args) {
      const result = await request("/agentmemory/mcp/call", {
        method: "POST",
        body: JSON.stringify({ name, arguments: args }),
      });
      if (
        !result ||
        typeof result !== "object" ||
        !Array.isArray((result as { content?: unknown }).content)
      ) {
        throw new Error("AgentMemory returned an invalid tools/call payload");
      }
      return result as CallToolResult;
    },
  };
}

export function createProtocolServer(backend: McpHttpBackend): McpServer {
  const server = new McpServer(
    { name: "agentmemory", version: VERSION },
    { capabilities: { tools: { listChanged: false } } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => backend.listTools());
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return await backend.callTool(
        request.params.name,
        request.params.arguments ?? {},
      );
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

function hostHeaderAllowed(hostHeader: string | undefined, host: string): boolean {
  if (!hostHeader) return false;
  try {
    const requested = new URL(`http://${hostHeader}`).hostname;
    if (isLoopbackHost(host)) return isLoopbackHost(requested);
    if (isWildcardHost(host)) return true;
    return requested.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function originAllowed(
  origin: string | undefined,
  host: string,
  allowedOrigins: string[],
): boolean {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, "");
  if (allowedOrigins.includes(normalized)) return true;
  try {
    return isLoopbackHost(host) && isLoopbackHost(new URL(normalized).hostname);
  } catch {
    return false;
  }
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json",
    "cache-control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function sendProtocolError(
  response: ServerResponse,
  statusCode: number,
  message: string,
  headers: Record<string, string> = {},
): void {
  sendJson(
    response,
    statusCode,
    {
      jsonrpc: "2.0",
      error: { code: -32000, message },
      id: null,
    },
    headers,
  );
}

export function createMcpHttpHandler(
  rawOptions: McpHttpOptions = {},
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  const options = normalizeOptions(rawOptions);

  return async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (url.pathname === "/healthz") {
      const upstream = await options.backend.health();
      sendJson(response, upstream ? 200 : 503, {
        status: upstream ? "ok" : "degraded",
        transport: "streamable-http",
        upstream,
      });
      return;
    }

    if (url.pathname !== options.path) {
      sendProtocolError(response, 404, "Not found");
      return;
    }

    if (!hostHeaderAllowed(request.headers.host, options.host)) {
      sendProtocolError(response, 403, "Forbidden host");
      return;
    }

    const origin = Array.isArray(request.headers.origin)
      ? request.headers.origin[0]
      : request.headers.origin;
    if (!originAllowed(origin, options.host, options.allowedOrigins)) {
      sendProtocolError(response, 403, "Forbidden origin");
      return;
    }

    if (options.token) {
      const authorization = request.headers.authorization ?? "";
      if (!timingSafeCompare(authorization, `Bearer ${options.token}`)) {
        sendProtocolError(response, 401, "Unauthorized", {
          "www-authenticate": "Bearer",
        });
        return;
      }
    }

    if (request.method !== "POST") {
      sendProtocolError(response, 405, "Method not allowed", { allow: "POST" });
      return;
    }

    const protocol = createProtocolServer(options.backend);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      void protocol.close().catch(() => {});
    };
    response.once("close", close);

    try {
      await protocol.connect(transport);
      await transport.handleRequest(request, response);
    } catch (error) {
      close();
      if (!response.headersSent) {
        sendProtocolError(
          response,
          500,
          error instanceof Error ? error.message : "Internal server error",
        );
      }
    }
  };
}

export async function startMcpHttpServer(
  rawOptions: McpHttpOptions = {},
): Promise<NodeServer> {
  const options = normalizeOptions(rawOptions);
  const handler = createMcpHttpHandler(options);
  const server = createNodeServer((request, response) => {
    void handler(request, response).catch((error) => {
      if (!response.headersSent) {
        sendProtocolError(
          response,
          500,
          error instanceof Error ? error.message : "Internal server error",
        );
      } else {
        response.destroy(error instanceof Error ? error : undefined);
      }
    });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(options.port, options.host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  return server;
}

export async function runMcpHttpServer(): Promise<void> {
  const host = resolveEnvOrEmpty("AGENTMEMORY_MCP_HTTP_HOST") || DEFAULT_HOST;
  const port = positivePort(
    resolveEnvOrEmpty("AGENTMEMORY_MCP_HTTP_PORT"),
    DEFAULT_PORT,
  );
  const server = await startMcpHttpServer({ host, port });
  process.stderr.write(
    `[@agentmemory/mcp] Streamable HTTP server v${VERSION} listening on http://${host}:${port}/mcp\n`,
  );

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

const entrypoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (entrypoint === import.meta.url) {
  void runMcpHttpServer().catch((error) => {
    process.stderr.write(
      `[@agentmemory/mcp] HTTP server failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    process.exit(1);
  });
}
