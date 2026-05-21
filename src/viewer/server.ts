import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderViewerDocument } from "./document.js";

// Self-host the viewer favicon at /favicon.svg instead of an inline
// data: URI so the viewer CSP can stay tight at `img-src 'self'`.
// Mirrors loadViewerTemplate() in document.ts — same candidate paths so
// it resolves both from source (vitest) and from dist/ (npm run start).
function loadViewerFavicon(): Buffer | null {
  const base = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(base, "..", "src", "viewer", "favicon.svg"),
    join(base, "..", "viewer", "favicon.svg"),
    join(base, "viewer", "favicon.svg"),
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path);
    } catch {}
  }
  return null;
}

const ALLOWED_ORIGINS = (
  process.env.VIEWER_ALLOWED_ORIGINS ||
  "http://localhost:3111,http://localhost:3113,http://127.0.0.1:3111,http://127.0.0.1:3113"
)
  .split(",")
  .map((o) => o.trim());

// Hosts the viewer will accept in the Host header. Restricting this is the
// defence against DNS rebinding: a browser visiting `attacker.com` whose
// authoritative DNS rebinds to 127.0.0.1 hits the viewer's listening socket
// directly, the Origin header reads `http://attacker.com` (same-origin from
// the browser's perspective on a same-port attacker page, so no preflight
// fires), and the request body is whatever the page wants. The viewer
// proxies it to the local REST API with the AGENTMEMORY_SECRET bearer
// attached, so the response stream is fully privileged. Rejecting any Host
// not in this allowlist closes that path before the proxy runs.
//
// Explicit override via VIEWER_ALLOWED_HOSTS for the rare case of a
// reverse-proxy in front of the viewer; defaults are computed from the
// listen port at server-create time.
const ALLOWED_HOSTS_OVERRIDE = (process.env.VIEWER_ALLOWED_HOSTS || "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export function buildAllowedHosts(
  origins: string[],
  listenPort: number,
): Set<string> {
  const hosts = new Set<string>();
  for (const o of origins) {
    try {
      const parsed = new URL(o);
      if (parsed.host) hosts.add(parsed.host.toLowerCase());
    } catch {
      // Skip invalid origin entries — the existing CORS path already
      // tolerates them by simply not matching; mirror that here.
    }
  }
  hosts.add(`localhost:${listenPort}`);
  hosts.add(`127.0.0.1:${listenPort}`);
  hosts.add(`[::1]:${listenPort}`);
  for (const h of ALLOWED_HOSTS_OVERRIDE) hosts.add(h);
  return hosts;
}

export function isHostAllowed(
  headerHost: string | string[] | undefined,
  allowed: Set<string>,
): boolean {
  if (typeof headerHost !== "string") return false;
  const lower = headerHost.toLowerCase().trim();
  if (!lower) return false;
  return allowed.has(lower);
}

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

let boundViewerPort: number | null = null;
let viewerSkipped = false;

export function getBoundViewerPort(): number | null {
  return boundViewerPort;
}
export function getViewerSkipped(): boolean {
  return viewerSkipped;
}

export function startViewerServer(
  port: number,
  _kv: unknown,
  _sdk: unknown,
  secret?: string,
  restPort?: number,
): Server {
  // Reset exported runtime state for each start attempt.
  boundViewerPort = null;
  viewerSkipped = false;

  const resolvedRestPort = restPort ?? port - 2;
  const requestedPort = port;
  // Computed lazily on first request — `port` may be 0 here (OS-assigned)
  // or the EADDRINUSE retry loop below may bump us to a different port,
  // so we read the actual bound port from server.address() on first hit.
  let allowedHosts: Set<string> | null = null;

  const server = createServer(async (req, res) => {
    if (!allowedHosts) {
      const addr = server.address();
      const actualPort =
        addr && typeof addr === "object" && "port" in addr
          ? (addr.port as number)
          : port;
      allowedHosts = buildAllowedHosts(ALLOWED_ORIGINS, actualPort);
    }
    if (!isHostAllowed(req.headers.host, allowedHosts)) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("forbidden host");
      return;
    }

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

    if (method === "GET" && pathname === "/favicon.svg") {
      const favicon = loadViewerFavicon();
      if (favicon) {
        res.writeHead(200, {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=3600",
        });
        res.end(favicon);
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("favicon not found");
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
    const addr = server.address();
    boundViewerPort =
      addr && typeof addr === "object" && "port" in addr
        ? addr.port
        : currentPort;
    viewerSkipped = false;
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
      boundViewerPort = null;
      viewerSkipped = true;
      console.warn(
        `[agentmemory] Viewer ports ${requestedPort}-${requestedPort + MAX_VIEWER_PORT_RETRIES} all in use, skipping viewer.`,
      );
    } else {
      boundViewerPort = null;
      viewerSkipped = true;
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
