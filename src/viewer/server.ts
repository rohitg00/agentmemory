import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { renderViewerDocument } from "./document.js";

const ALLOWED_ORIGINS = (
  process.env.VIEWER_ALLOWED_ORIGINS ||
  "http://localhost:3111,http://localhost:3113,http://127.0.0.1:3111,http://127.0.0.1:3113"
)
  .split(",")
  .map((o) => o.trim());

function corsHeaders(req: IncomingMessage): Record<string, string> {
  const origin = req.headers.origin || "";
  const allowed = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

function json(
  res: ServerResponse,
  status: number,
  data: unknown,
  req?: IncomingMessage,
): void {
  const body = JSON.stringify(data);
  const cors = req
    ? corsHeaders(req)
    : { "Access-Control-Allow-Origin": ALLOWED_ORIGINS[0], Vary: "Origin" };
  res.writeHead(status, { ...cors, "Content-Type": "application/json" });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) {
        req.destroy();
        reject(new Error("too large"));
        return;
      }
      data += chunk.toString();
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const MAX_VIEWER_PORT_RETRIES = 10;

export function startViewerServer(
  port: number,
  _kv: unknown,
  _sdk: unknown,
  secret?: string,
  restPort?: number,
): Server {
  const resolvedRestPort = restPort ?? port - 2;
  const requestedPort = port;

  const server = createServer(async (req, res) => {
    const raw = req.url || "/";
    const qIdx = raw.indexOf("?");
    const pathname = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
    const qs = qIdx >= 0 ? raw.slice(qIdx + 1) : "";
    const method = req.method || "GET";

    if (method === "OPTIONS") {
      res.writeHead(204, {
        ...corsHeaders(req),
        "Access-Control-Max-Age": "86400",
      });
      res.end();
      return;
    }

    if (
      method === "GET" &&
      (pathname === "/" ||
        pathname === "/viewer" ||
        pathname === "/agentmemory/viewer")
    ) {
      const rendered = renderViewerDocument();
      if (rendered.found) {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": rendered.csp,
          "Cache-Control": "no-cache",
        });
        res.end(rendered.html);
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("viewer not found");
      return;
    }

    try {
      await proxyToRestApi(resolvedRestPort, pathname, qs, method, req, res, secret);
    } catch (err) {
      console.error(`[viewer] proxy error on ${method} ${pathname}:`, err);
      json(res, 502, { error: "upstream error" }, req);
    }
  });

  let attempt = 0;
  let currentPort = requestedPort;

  const tryListen = (): void => {
    server.listen(currentPort, "127.0.0.1");
  };

  server.on("listening", () => {
    if (currentPort === requestedPort) {
      console.log(`[agentmemory] Viewer: http://localhost:${currentPort}`);
    } else {
      console.log(
        `[agentmemory] Viewer started on http://localhost:${currentPort} (fallback from ${requestedPort})`,
      );
    }
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attempt < MAX_VIEWER_PORT_RETRIES) {
      attempt++;
      currentPort = requestedPort + attempt;
      setImmediate(tryListen);
      return;
    }
    if (err.code === "EADDRINUSE") {
      console.warn(
        `[agentmemory] Viewer ports ${requestedPort}-${requestedPort + MAX_VIEWER_PORT_RETRIES} all in use, skipping viewer.`,
      );
    } else {
      console.error(`[agentmemory] Viewer error:`, err.message);
    }
  });

  tryListen();

  return server;
}

async function proxyToRestApi(
  restPort: number,
  pathname: string,
  qs: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  secret?: string,
): Promise<void> {
  const upstreamPath = pathname.startsWith("/agentmemory/")
    ? pathname
    : `/agentmemory${pathname.startsWith("/") ? pathname : "/" + pathname}`;

  const upstreamUrl = `http://127.0.0.1:${restPort}${upstreamPath}${qs ? "?" + qs : ""}`;

  const headers: Record<string, string> = {};
  if (secret) {
    headers["Authorization"] = `Bearer ${secret}`;
  }
  const ct = req.headers["content-type"];
  if (ct) {
    headers["Content-Type"] = ct;
  }

  let body: string | undefined;
  if (method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH") {
    body = await readBody(req);
  }

  const controller = new AbortController();
  const fetchTimeout = setTimeout(() => controller.abort(), 10000);
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body: body || undefined,
      signal: controller.signal,
    });
    clearTimeout(fetchTimeout);
  } catch (err) {
    clearTimeout(fetchTimeout);
    if (err instanceof Error && err.name === "AbortError") {
      json(res, 504, { error: "upstream timeout" }, req);
      return;
    }
    throw err;
  }

  const cors = corsHeaders(req);
  const responseBody = await upstream.text();
  const responseHeaders: Record<string, string> = {
    ...cors,
  };
  const upstreamCt = upstream.headers.get("content-type");
  if (upstreamCt) {
    responseHeaders["Content-Type"] = upstreamCt;
  }

  res.writeHead(upstream.status, responseHeaders);
  res.end(responseBody);
}
