import * as http from "http";
import * as https from "https";
import * as tls from "tls";
import { createRequire } from "module";

const _require = createRequire(import.meta.url);

// RFC 6066 §3: TLS SNI must not be an IP address literal.
// Node.js v26 enforces this strictly; older versions silently ignored it.
function isIPAddress(host: string): boolean {
  // IPv4
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return true;
  // IPv6 (bare or bracket-wrapped)
  if (host.startsWith("[") || host.includes(":")) return true;
  return false;
}

/**
 * Creates an https.Agent that tunnels through an HTTP CONNECT proxy.
 * Uses only Node.js built-in modules (http, https, tls, net) — no tunnel-agent.
 *
 * Handles Node.js v26 strict SNI validation: when the target host is an IP
 * address, `servername` is omitted entirely so TLS validates via IP SAN instead.
 */
function createProxyHttpsAgent(proxyUrl: string): https.Agent {
  const proxy = new URL(proxyUrl);
  const proxyHost = proxy.hostname;
  const proxyPort = parseInt(proxy.port || "3128");
  const proxyAuth =
    proxy.username
      ? `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`
      : undefined;

  const agent = new https.Agent({ keepAlive: false });
  // Override createConnection to tunnel through proxy via HTTP CONNECT
  (agent as unknown as Record<string, unknown>).createConnection = function (
    options: tls.ConnectionOptions & { host?: string; port?: number },
    cb: (err: Error | null, socket?: tls.TLSSocket) => void,
  ) {
    const targetHost = options.host || "localhost";
    const targetPort = options.port || 443;

    const connectHeaders: Record<string, string> = {
      host: `${targetHost}:${targetPort}`,
    };
    if (proxyAuth) {
      connectHeaders["proxy-authorization"] =
        "Basic " + Buffer.from(proxyAuth).toString("base64");
    }

    const connectReq = http.request({
      host: proxyHost,
      port: proxyPort,
      method: "CONNECT",
      path: `${targetHost}:${targetPort}`,
      headers: connectHeaders,
    });

    connectReq.once("connect", (_res, socket) => {
      const tlsOptions: tls.ConnectionOptions = {
        socket,
        rejectUnauthorized: options.rejectUnauthorized !== false,
      };
      // Skip SNI for IP addresses — Node.js v26 rejects IP SNI per RFC 6066 §3
      if (!isIPAddress(targetHost)) {
        tlsOptions.servername = targetHost;
      }
      const tlsSocket = tls.connect(tlsOptions, () => cb(null, tlsSocket));
      tlsSocket.once("error", cb);
    });

    connectReq.once("error", cb);
    connectReq.end();
  };

  return agent;
}

/**
 * Returns a proxy-aware fetch function when HTTP_PROXY/HTTPS_PROXY env vars are set.
 * Uses node-fetch (optional dep) with a custom https.Agent for tunneling.
 * Returns undefined when no proxy is configured or node-fetch is not installed.
 *
 * @param context - caller name for diagnostic messages
 */
export function buildProxyFetch(
  context: string,
): ((url: string, init: unknown) => Promise<Response>) | undefined {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (!proxyUrl) return undefined;

  try {
    const nodeFetch = _require("node-fetch") as (
      url: string,
      init: unknown,
    ) => Promise<Response>;
    const httpsAgent = createProxyHttpsAgent(proxyUrl);
    // Only inject the HTTPS agent for https: URLs.
    // HTTP URLs (e.g. http://localhost:3111) must NOT use an https.Agent —
    // node-fetch throws ERR_INVALID_PROTOCOL if you pass one for http: requests.
    return (url: string, init: unknown) => {
      const isHttps = typeof url === "string" && url.startsWith("https:");
      return nodeFetch(url, isHttps ? { ...(init as object), agent: httpsAgent } : init);
    };
  } catch {
    process.stderr.write(
      `[agentmemory] ${context}: proxy env vars detected but node-fetch ` +
        "could not be loaded — falling back to global fetch (proxy bypassed). " +
        "Install optional dep: npm install node-fetch\n",
    );
    return undefined;
  }
}
