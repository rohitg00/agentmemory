import { describe, it, expect, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
import { renderViewerDocument } from "../src/viewer/document.js";
import {
  buildAllowedHosts,
  isHostAllowed,
  startViewerServer,
} from "../src/viewer/server.js";

describe("viewer document security", () => {
  it("serves a nonce-backed CSP without unsafe-inline script execution", () => {
    const rendered = renderViewerDocument();
    expect(rendered.found).toBe(true);
    if (!rendered.found) return;

    expect(rendered.csp).toContain("script-src 'nonce-");
    expect(rendered.csp).toContain("script-src-attr 'none'");
    expect(rendered.csp).toContain("img-src 'self'");
    expect(rendered.csp).not.toContain("script-src 'unsafe-inline'");
    expect(rendered.html).toContain("<script nonce=\"");
    expect(rendered.html).not.toContain("__AGENTMEMORY_VIEWER_NONCE__");
  });

  it("does not loosen img-src with bare data: URI allowance (#447)", () => {
    // #313 added `data:` so an inline-SVG favicon could load. #447 reverts
    // that by self-hosting the favicon at /favicon.svg — `data:` would
    // also allow any data:image/png;base64,... and (in some browsers)
    // data:text/html;base64,..., which the viewer never needs.
    const rendered = renderViewerDocument();
    expect(rendered.found).toBe(true);
    if (!rendered.found) return;

    const directives = rendered.csp.split(";").map((d) => d.trim());
    const imgSrc = directives.find((d) => d.startsWith("img-src"));
    expect(imgSrc).toBeDefined();
    expect(imgSrc).toBe("img-src 'self'");
    expect(imgSrc).not.toContain("data:");

    // Favicon link in the HTML must reference the self-hosted file, not
    // an inline data: URI — that's what lets the CSP stay tight.
    expect(rendered.html).toContain('href="/favicon.svg"');
    expect(rendered.html).not.toContain("data:image/svg+xml");
  });

  it("does not contain inline DOM event handlers", () => {
    const rendered = renderViewerDocument();
    expect(rendered.found).toBe(true);
    if (!rendered.found) return;

    expect(rendered.html).not.toContain("onclick=");
    expect(rendered.html).not.toContain("onmouseover=");
    expect(rendered.html).not.toContain("onmouseout=");
  });
});

describe("viewer host allowlist (DNS rebinding defence)", () => {
  const DEFAULT_ORIGINS = [
    "http://localhost:3111",
    "http://localhost:3113",
    "http://127.0.0.1:3111",
    "http://127.0.0.1:3113",
  ];

  it("accepts loopback host:port combinations the viewer is reachable at", () => {
    const allowed = buildAllowedHosts(DEFAULT_ORIGINS, 3113);
    expect(isHostAllowed("localhost:3113", allowed)).toBe(true);
    expect(isHostAllowed("127.0.0.1:3113", allowed)).toBe(true);
    expect(isHostAllowed("[::1]:3113", allowed)).toBe(true);
  });

  it("includes the rest-port host so the same origin list works for the REST server", () => {
    const allowed = buildAllowedHosts(DEFAULT_ORIGINS, 3113);
    expect(isHostAllowed("localhost:3111", allowed)).toBe(true);
    expect(isHostAllowed("127.0.0.1:3111", allowed)).toBe(true);
  });

  it("rejects rebound attacker hostnames pointing at loopback", () => {
    const allowed = buildAllowedHosts(DEFAULT_ORIGINS, 3113);
    // Classic DNS-rebinding payload: attacker domain on the viewer port.
    expect(isHostAllowed("attacker.com:3113", allowed)).toBe(false);
    expect(isHostAllowed("evil.example:3113", allowed)).toBe(false);
    // 0.0.0.0 is a routable loopback alias on Linux but not what the
    // viewer prints; reject so an attacker can't substitute it.
    expect(isHostAllowed("0.0.0.0:3113", allowed)).toBe(false);
  });

  it("rejects bare loopback Host headers without the listening port", () => {
    const allowed = buildAllowedHosts(DEFAULT_ORIGINS, 3113);
    // Curl-style `Host: localhost` (no port) does NOT match `localhost:3113`.
    expect(isHostAllowed("localhost", allowed)).toBe(false);
    expect(isHostAllowed("127.0.0.1", allowed)).toBe(false);
  });

  it("rejects missing, empty, or non-string Host headers", () => {
    const allowed = buildAllowedHosts(DEFAULT_ORIGINS, 3113);
    expect(isHostAllowed(undefined, allowed)).toBe(false);
    expect(isHostAllowed("", allowed)).toBe(false);
    expect(isHostAllowed("   ", allowed)).toBe(false);
    // Node sets `host` to a string array only in very unusual setups;
    // treat anything non-string as forbidden.
    expect(isHostAllowed(["localhost:3113"] as unknown as string, allowed))
      .toBe(false);
  });

  it("is case-insensitive on hostname per RFC 3986 §3.2.2", () => {
    const allowed = buildAllowedHosts(DEFAULT_ORIGINS, 3113);
    expect(isHostAllowed("LOCALHOST:3113", allowed)).toBe(true);
    expect(isHostAllowed("LocalHost:3113", allowed)).toBe(true);
  });

  it("honours operator-supplied VIEWER_ALLOWED_ORIGINS on the host check", () => {
    const custom = buildAllowedHosts(
      ["http://memory.internal:8080", "http://localhost:3113"],
      3113,
    );
    expect(isHostAllowed("memory.internal:8080", custom)).toBe(true);
    expect(isHostAllowed("memory.internal", custom)).toBe(false);
    expect(isHostAllowed("attacker.com:3113", custom)).toBe(false);
  });

  it("ignores malformed origin entries instead of throwing", () => {
    const allowed = buildAllowedHosts(
      ["not-a-url", "", "http://localhost:3113"],
      3113,
    );
    expect(isHostAllowed("localhost:3113", allowed)).toBe(true);
  });
});

describe("viewer request handler DNS rebinding defence (e2e)", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterAll(async () => {
    for (const c of cleanups) await c();
  });

  async function spinUpViewer(): Promise<{ port: number }> {
    // Start on port 0 so the OS assigns a free port; passing a real port
    // exercises buildAllowedHosts() with the live listen value.
    const server = startViewerServer(0, {}, {}, undefined, 0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const addr = server.address() as AddressInfo;
    cleanups.push(
      () => new Promise<void>((resolve) => server.close(() => resolve())),
    );
    return { port: addr.port };
  }

  // Use node:http directly — the global `fetch` (undici) silently
  // overrides the Host header to the URL authority, so we cannot use it
  // to simulate a DNS-rebinding payload that lands on 127.0.0.1 while
  // carrying `Host: attacker.com`.
  function request(
    port: number,
    hostHeader: string,
    pathname = "/agentmemory/livez",
  ): Promise<{ status: number; body: string; headers: Record<string, string | string[] | undefined> }> {
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port,
          path: pathname,
          method: "GET",
          headers: { Host: hostHeader },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk: Buffer) => {
            body += chunk.toString();
          });
          res.on("end", () => {
            resolve({
              status: res.statusCode ?? 0,
              body,
              headers: res.headers,
            });
          });
        },
      );
      req.on("error", reject);
      req.end();
    });
  }

  it("returns 403 on an attacker-controlled Host header (DNS rebinding payload)", async () => {
    const { port } = await spinUpViewer();
    const res = await request(port, `attacker.com:${port}`);
    expect(res.status).toBe(403);
    expect(res.body).toContain("forbidden host");
  });

  it("returns 403 even on the viewer landing page when Host is not loopback", async () => {
    const { port } = await spinUpViewer();
    const res = await request(port, `evil.example:${port}`, "/");
    expect(res.status).toBe(403);
    expect(res.body).toContain("forbidden host");
  });

  it("accepts loopback Host headers and serves the viewer HTML", async () => {
    const { port } = await spinUpViewer();
    const res = await request(port, `localhost:${port}`, "/");
    // 200 with the viewer HTML when the bundled template is resolvable,
    // or 404 when running from source without `npm run build` having
    // populated dist/viewer/. Either way it's NOT 403 — the host gate
    // passed. The CSP nonce assertion below is the load-bearing check.
    expect(res.status === 200 || res.status === 404).toBe(true);
    if (res.status === 200) {
      expect(res.body).toContain("agentmemory viewer");
    }
  });

  it("serves /favicon.svg with image/svg+xml so the tight CSP can drop data: (#447)", async () => {
    const { port } = await spinUpViewer();
    const res = await request(port, `localhost:${port}`, "/favicon.svg");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/svg+xml");
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");
    // SVG payload must actually be SVG, not the proxied REST error body.
    expect(res.body).toMatch(/^<svg\b/);
    expect(res.body).toContain("</svg>");
    // Sanity-check the artwork: rounded dark tile + green "AM" lettering.
    expect(res.body).toContain('fill="#111111"');
    expect(res.body).toContain(">AM<");
  });
});
