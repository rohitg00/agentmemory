import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGINAL_HOME = process.env["HOME"];
const ORIGINAL_USERPROFILE = process.env["USERPROFILE"];

let sandboxHome: string;

function clearOrcaEnv(): void {
  for (const key of [
    "ORCA_BASE_URL",
    "ORCA_AUTH_BASE_URL",
    "ORCA_API_BASE_URL",
    "ORCAROUTER_API_KEY",
    "ORCAROUTER_MODEL",
  ]) {
    delete process.env[key];
  }
}

beforeEach(() => {
  sandboxHome = mkdtempSync(join(tmpdir(), "agentmemory-orca-"));
  process.env["HOME"] = sandboxHome;
  process.env["USERPROFILE"] = sandboxHome;
  clearOrcaEnv();
  vi.resetModules();
});

afterEach(() => {
  process.env["HOME"] = ORIGINAL_HOME;
  if (ORIGINAL_USERPROFILE === undefined) delete process.env["USERPROFILE"];
  else process.env["USERPROFILE"] = ORIGINAL_USERPROFILE;
  clearOrcaEnv();
  rmSync(sandboxHome, { recursive: true, force: true });
});

/**
 * The two origins are the single most common integration mistake, so every
 * assertion here is about which host a request is allowed to reach.
 */
describe("OrcaRouter origins", () => {
  it("defaults auth to www and inference to api, with different hosts", async () => {
    const { resolveOrigins, authorizeUrl, exchangeUrl, modelsUrl, chatCompletionsUrl } =
      await import("../src/orcarouter/origins.js");
    const origins = resolveOrigins((k) => process.env[k]);

    expect(origins.authBaseUrl).toBe("https://www.orcarouter.ai");
    expect(origins.apiBaseUrl).toBe("https://api.orcarouter.ai");

    expect(authorizeUrl(origins)).toBe("https://www.orcarouter.ai/auth");
    expect(exchangeUrl(origins)).toBe(
      "https://www.orcarouter.ai/api/v1/auth/keys",
    );
    expect(modelsUrl(origins)).toBe("https://api.orcarouter.ai/v1/models");
    expect(chatCompletionsUrl(origins)).toBe(
      "https://api.orcarouter.ai/v1/chat/completions",
    );
  });

  it("never derives one origin from the other (auth is not <api>/v1)", async () => {
    const { resolveOrigins, exchangeUrl, modelsUrl } = await import(
      "../src/orcarouter/origins.js"
    );
    const origins = resolveOrigins((k) => process.env[k]);

    // The classic error is `https://api.orcarouter.ai/v1/auth/keys`, a 404.
    expect(exchangeUrl(origins)).not.toContain("api.orcarouter.ai");
    // ...and the path must be under /api/v1/auth, not a bare /v1/auth.
    expect(exchangeUrl(origins)).toContain("/api/v1/auth/keys");
    expect(exchangeUrl(origins)).not.toMatch(/[^i]\/v1\/auth\/keys/);
    expect(modelsUrl(origins)).not.toContain("www.orcarouter.ai");
  });

  it("treats ORCA_BASE_URL as a shared fallback for both halves", async () => {
    process.env["ORCA_BASE_URL"] = "https://gateway.internal.example";
    const { resolveOrigins } = await import("../src/orcarouter/origins.js");
    const origins = resolveOrigins((k) => process.env[k]);
    expect(origins.authBaseUrl).toBe("https://gateway.internal.example");
    expect(origins.apiBaseUrl).toBe("https://gateway.internal.example");
  });

  it("lets explicit overrides win over the shared base", async () => {
    process.env["ORCA_BASE_URL"] = "https://shared.example";
    process.env["ORCA_AUTH_BASE_URL"] = "https://auth.example";
    process.env["ORCA_API_BASE_URL"] = "https://relay.example";
    const { resolveOrigins } = await import("../src/orcarouter/origins.js");
    const origins = resolveOrigins((k) => process.env[k]);
    expect(origins.authBaseUrl).toBe("https://auth.example");
    expect(origins.apiBaseUrl).toBe("https://relay.example");
  });

  it("requires HTTPS for remote origins and allows HTTP only on loopback", async () => {
    const { normalizeOrigin } = await import("../src/orcarouter/origins.js");
    expect(() => normalizeOrigin("http://evil.example", "ORCA_BASE_URL")).toThrow(
      /plain http/i,
    );
    expect(normalizeOrigin("http://127.0.0.1:8080", "ORCA_BASE_URL")).toBe(
      "http://127.0.0.1:8080",
    );
    expect(normalizeOrigin("http://localhost:9999", "ORCA_BASE_URL")).toBe(
      "http://localhost:9999",
    );
    expect(() => normalizeOrigin("ftp://x.example", "ORCA_BASE_URL")).toThrow();
  });
});

describe("PKCE primitives", () => {
  it("derives an unpadded base64url S256 challenge from the verifier", async () => {
    const { createPkceAttempt, challengeFor } = await import(
      "../src/orcarouter/pkce.js"
    );
    const attempt = createPkceAttempt();

    const expected = createHash("sha256")
      .update(attempt.verifier)
      .digest("base64url");
    expect(attempt.challenge).toBe(expected);
    expect(attempt.challenge).toBe(challengeFor(attempt.verifier));

    // No padding, and URL-safe alphabet only.
    expect(attempt.challenge).not.toContain("=");
    expect(attempt.challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(attempt.verifier).not.toContain("=");
    // 32 bytes of entropy -> 43 base64url chars.
    expect(attempt.verifier).toHaveLength(43);
  });

  it("mints a fresh verifier and state for every attempt", async () => {
    const { createPkceAttempt } = await import("../src/orcarouter/pkce.js");
    const attempts = Array.from({ length: 25 }, () => createPkceAttempt());
    expect(new Set(attempts.map((a) => a.verifier)).size).toBe(25);
    expect(new Set(attempts.map((a) => a.state)).size).toBe(25);
  });

  it("sends only the challenge and state on the authorize URL, never the verifier", async () => {
    const { createPkceAttempt, buildAuthorizeUrl } = await import(
      "../src/orcarouter/pkce.js"
    );
    const { resolveOrigins } = await import("../src/orcarouter/origins.js");
    const attempt = createPkceAttempt();

    const url = buildAuthorizeUrl({
      origins: resolveOrigins((k) => process.env[k]),
      attempt,
      appName: "agentmemory",
      callbackUrl: "http://127.0.0.1:51733/cb",
    });

    expect(url.startsWith("https://www.orcarouter.ai/auth?")).toBe(true);
    expect(url).not.toContain("api.orcarouter.ai");
    expect(url).not.toContain(attempt.verifier);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("code_challenge")).toBe(attempt.challenge);
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBe(attempt.state);
    expect(parsed.searchParams.get("callback_url")).toBe(
      "http://127.0.0.1:51733/cb",
    );
    expect(parsed.searchParams.get("app_name")).toBe("agentmemory");
  });
});

/** A local stand-in for the OrcaRouter auth origin. */
async function startFakeAuthServer(handler: (body: any, url: string) => {
  status: number;
  json: unknown;
}): Promise<{ server: Server; origin: string; requests: Array<{ url: string; body: any }> }> {
  const requests: Array<{ url: string; body: any }> = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: any = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = Object.fromEntries(new URLSearchParams(raw));
      }
      requests.push({ url: req.url ?? "", body });
      const out = handler(body, req.url ?? "");
      res.writeHead(out.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out.json));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const port = addr && typeof addr === "object" ? addr.port : 0;
  return { server, origin: `http://127.0.0.1:${port}`, requests };
}

describe("PKCE code exchange", () => {
  it("posts the verifier to the AUTH origin's /api/v1/auth/keys, never the relay", async () => {
    const { exchangeCode } = await import("../src/orcarouter/pkce.js");
    const fake = await startFakeAuthServer(() => ({
      status: 200,
      json: { key: "sk-orca-testkey123456", user_id: "12345", scope: "api" },
    }));

    try {
      const result = await exchangeCode({
        origins: {
          authBaseUrl: fake.origin,
          apiBaseUrl: "https://api.orcarouter.ai",
        },
        code: "fake-code",
        verifier: "fake-verifier",
      });

      expect(result.key).toBe("sk-orca-testkey123456");
      expect(result.userId).toBe("12345");
      expect(result.scope).toBe("api");

      expect(fake.requests).toHaveLength(1);
      expect(fake.requests[0]!.url).toBe("/api/v1/auth/keys");
      expect(fake.requests[0]!.body).toMatchObject({
        code: "fake-code",
        code_verifier: "fake-verifier",
        code_challenge_method: "S256",
      });
    } finally {
      fake.server.close();
    }
  });

  it("reads the GRANTED scope and refuses a downgrade instead of assuming", async () => {
    const { exchangeCode, OrcaRouterAuthError } = await import(
      "../src/orcarouter/pkce.js"
    );
    // Asked for `connector`, granted `api` — the workspace role narrowed it.
    const fake = await startFakeAuthServer(() => ({
      status: 200,
      json: { key: "sk-orca-testkey123456", user_id: "1", scope: "readonly" },
    }));
    try {
      await expect(
        exchangeCode({
          origins: { authBaseUrl: fake.origin, apiBaseUrl: "https://api.orcarouter.ai" },
          code: "c",
          verifier: "v",
        }),
      ).rejects.toMatchObject({ kind: "scope_insufficient" });
    } finally {
      fake.server.close();
    }
  });

  it("classifies 403 as a terminal rejected code (expired or reused)", async () => {
    const { exchangeCode } = await import("../src/orcarouter/pkce.js");
    const fake = await startFakeAuthServer(() => ({
      status: 403,
      json: { error: "invalid_grant" },
    }));
    try {
      await expect(
        exchangeCode({
          origins: { authBaseUrl: fake.origin, apiBaseUrl: "https://api.orcarouter.ai" },
          code: "c",
          verifier: "v",
        }),
      ).rejects.toMatchObject({ kind: "code_rejected", status: 403 });
    } finally {
      fake.server.close();
    }
  });

  it("classifies 400 as the challenge-method downgrade defence firing", async () => {
    const { exchangeCode } = await import("../src/orcarouter/pkce.js");
    const fake = await startFakeAuthServer(() => ({ status: 400, json: {} }));
    try {
      await expect(
        exchangeCode({
          origins: { authBaseUrl: fake.origin, apiBaseUrl: "https://api.orcarouter.ai" },
          code: "c",
          verifier: "v",
        }),
      ).rejects.toMatchObject({ kind: "method_rejected" });
    } finally {
      fake.server.close();
    }
  });

  it("classifies 429 as rate limited and marks it retryable", async () => {
    const { exchangeCode } = await import("../src/orcarouter/pkce.js");
    const fake = await startFakeAuthServer(() => ({ status: 429, json: {} }));
    try {
      const err = await exchangeCode({
        origins: { authBaseUrl: fake.origin, apiBaseUrl: "https://api.orcarouter.ai" },
        code: "c",
        verifier: "v",
      }).catch((e) => e);
      expect(err.kind).toBe("rate_limited");
      expect(err.retryable).toBe(true);
    } finally {
      fake.server.close();
    }
  });

  it("surfaces a transport failure as a network error without echoing the request", async () => {
    const { exchangeCode } = await import("../src/orcarouter/pkce.js");
    const err = await exchangeCode({
      // Reserved TEST-NET-1 address: connection fails fast, nothing leaves the box.
      origins: { authBaseUrl: "http://127.0.0.1:1", apiBaseUrl: "https://api.orcarouter.ai" },
      code: "super-secret-code",
      verifier: "super-secret-verifier",
      timeoutMs: 2000,
    }).catch((e) => e);

    expect(err.kind).toBe("network");
    expect(err.message).not.toContain("super-secret-code");
    expect(err.message).not.toContain("super-secret-verifier");
  });

  it("never lets the verifier or the key reach the error message", async () => {
    const { exchangeCode } = await import("../src/orcarouter/pkce.js");
    const fake = await startFakeAuthServer(() => ({ status: 403, json: {} }));
    try {
      const err = await exchangeCode({
        origins: { authBaseUrl: fake.origin, apiBaseUrl: "https://api.orcarouter.ai" },
        code: "CODE-SECRET",
        verifier: "VERIFIER-SECRET",
      }).catch((e) => e);
      expect(err.message).not.toContain("VERIFIER-SECRET");
      expect(err.message).not.toContain("CODE-SECRET");
      expect(err.message).not.toContain("sk-orca-");
    } finally {
      fake.server.close();
    }
  });
});

describe("Flow A loopback receiver", () => {
  it("accepts a matching state and returns the code", async () => {
    const { createPkceAttempt, openLoopback } = await import(
      "../src/orcarouter/pkce.js"
    );
    const attempt = createPkceAttempt();
    const receiver = await openLoopback(attempt, { timeoutMs: 5000 });
    try {
      expect(receiver.callbackUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/cb$/);
      const res = await fetch(
        `${receiver.callbackUrl}?code=abc123&state=${encodeURIComponent(attempt.state)}`,
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("close this tab");
      await expect(receiver.result).resolves.toBe("abc123");
    } finally {
      receiver.close();
    }
  });

  it("refuses a mismatched state before touching the code", async () => {
    const { createPkceAttempt, openLoopback } = await import(
      "../src/orcarouter/pkce.js"
    );
    const attempt = createPkceAttempt();
    const receiver = await openLoopback(attempt, { timeoutMs: 5000 });
    try {
      const res = await fetch(`${receiver.callbackUrl}?code=stolen&state=wrong-state`);
      expect(res.status).toBe(200);
      const err = await receiver.result.catch((e) => e);
      expect(err.kind).toBe("state_mismatch");
    } finally {
      receiver.close();
    }
  });

  it("reports a denial as its own terminal kind", async () => {
    const { createPkceAttempt, openLoopback } = await import(
      "../src/orcarouter/pkce.js"
    );
    const attempt = createPkceAttempt();
    const receiver = await openLoopback(attempt, { timeoutMs: 5000 });
    try {
      await fetch(
        `${receiver.callbackUrl}?error=access_denied&state=${encodeURIComponent(attempt.state)}`,
      );
      const err = await receiver.result.catch((e) => e);
      expect(err.kind).toBe("denied");
    } finally {
      receiver.close();
    }
  });

  it("times out without hanging, and close() cancels a pending attempt", async () => {
    const { createPkceAttempt, openLoopback } = await import(
      "../src/orcarouter/pkce.js"
    );

    const timed = await openLoopback(createPkceAttempt(), { timeoutMs: 60 });
    const timeoutErr = await timed.result.catch((e) => e);
    expect(timeoutErr.kind).toBe("timeout");

    const canceled = await openLoopback(createPkceAttempt(), { timeoutMs: 5000 });
    canceled.close();
    const cancelErr = await canceled.result.catch((e) => e);
    expect(cancelErr.kind).toBe("canceled");
  });

  it("uses a fresh ephemeral port per attempt", async () => {
    const { createPkceAttempt, openLoopback } = await import(
      "../src/orcarouter/pkce.js"
    );
    const a = await openLoopback(createPkceAttempt(), { timeoutMs: 5000 });
    const b = await openLoopback(createPkceAttempt(), { timeoutMs: 5000 });
    try {
      expect(a.port).toBeGreaterThan(0);
      expect(b.port).toBeGreaterThan(0);
      expect(a.port).not.toBe(b.port);
    } finally {
      a.close();
      b.close();
    }
  });
});

describe("credential seam — two adapters, one credential", () => {
  function writeEnvFile(lines: string[]): void {
    const dir = join(sandboxHome, ".agentmemory");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".env"), lines.join("\n") + "\n", { mode: 0o600 });
  }

  it("API-key adapter persists the key and returns the shared credential shape", async () => {
    writeEnvFile(["# agentmemory", "ANTHROPIC_API_KEY=sk-ant-x"]);
    const creds = await import("../src/orcarouter/credentials.js");

    const result = creds.connectWithApiKey("sk-orca-abcdefghijklmnop");
    expect(result.credential.apiKey).toBe("sk-orca-abcdefghijklmnop");
    expect(result.credential.origin).toBe("api_key");
    expect(result.credential.status).toBe("ok");
    expect(result.message).not.toContain("sk-orca-abcdefghijklmnop");
    expect(result.message).toContain(creds.maskSecret("sk-orca-abcdefghijklmnop"));

    // The key is stored in the same file as every other provider secret, with
    // the other lines left alone.
    const contents = readFileSync(join(sandboxHome, ".agentmemory", ".env"), "utf-8");
    expect(contents).toContain("ORCAROUTER_API_KEY=sk-orca-abcdefghijklmnop");
    expect(contents).toContain("ANTHROPIC_API_KEY=sk-ant-x");
    expect(contents).not.toContain("sk-orca-abcdefghijklmnop\nsk-orca");

    // And it is readable back through the seam.
    creds.__resetCredentialCache();
    expect(creds.resolveCredential()?.apiKey).toBe("sk-orca-abcdefghijklmnop");
  });

  it("PKCE adapter produces the identical credential shape as the API-key adapter", async () => {
    const creds = await import("../src/orcarouter/credentials.js");

    const viaKey = creds.connectWithApiKey("sk-orca-keypath000000");
    const viaPkce = creds.persistPkceCredential({
      apiKey: "sk-orca-pkcepath000000",
      userId: "42",
      scope: "api",
    });

    // Same keys, same semantics: downstream code cannot tell them apart.
    expect(Object.keys(viaPkce).sort()).toEqual(Object.keys(viaKey.credential).sort());
    expect(viaPkce.origin).toBe("pkce");
    expect(viaPkce.status).toBe("ok");
    expect(viaPkce.userId).toBe("42");
    expect(creds.resolveCredential()?.apiKey).toBe("sk-orca-pkcepath000000");
  });

  it("rejects a key that is not shaped like an OrcaRouter key", async () => {
    const creds = await import("../src/orcarouter/credentials.js");
    expect(() => creds.connectWithApiKey("sk-or-abcdefghijklmnop")).toThrow(
      /sk-orca-/,
    );
    expect(() => creds.connectWithApiKey("   ")).toThrow();
    expect(creds.looksLikeOrcaRouterKey("sk-orca-abcdefghijklmnop")).toBe(true);
    expect(creds.looksLikeOrcaRouterKey("sk-orca-short")).toBe(false);
  });

  it("masks secrets without leaking enough to reuse them", async () => {
    const { maskSecret } = await import("../src/orcarouter/credentials.js");
    const masked = maskSecret("sk-orca-abcdefghijklmnop");
    expect(masked).not.toContain("ijklmnop");
    expect(masked.startsWith("sk-orca")).toBe(true);
    expect(masked).toContain("…");
    expect(maskSecret("")).toBe("");
    expect(maskSecret(undefined)).toBe("");
    expect(maskSecret("short")).toBe("*****");
  });

  it("clears both the stored credential and the env fallback", async () => {
    const creds = await import("../src/orcarouter/credentials.js");
    creds.connectWithApiKey("sk-orca-abcdefghijklmnop");
    expect(creds.resolveCredential()).not.toBeNull();

    expect(creds.clearCredential()).toBe(true);
    expect(creds.resolveCredential()).toBeNull();
    expect(creds.hasCredential()).toBe(false);

    const contents = readFileSync(join(sandboxHome, ".agentmemory", ".env"), "utf-8");
    expect(contents).not.toContain("ORCAROUTER_API_KEY=sk-orca");
  });

  it("upserts and removes env lines without disturbing the rest of the file", async () => {
    writeEnvFile(["# keep me", "ANTHROPIC_API_KEY=sk-ant-x", "MAX_TOKENS=4096"]);
    const creds = await import("../src/orcarouter/credentials.js");

    creds.upsertEnvVar("ORCAROUTER_API_KEY", "sk-orca-first00000000");
    creds.upsertEnvVar("ORCAROUTER_API_KEY", "sk-orca-second0000000");
    let contents = readFileSync(join(sandboxHome, ".agentmemory", ".env"), "utf-8");
    expect(contents).toContain("ORCAROUTER_API_KEY=sk-orca-second0000000");
    expect(contents).not.toContain("sk-orca-first00000000");
    expect(contents).toContain("# keep me");
    expect(contents).toContain("MAX_TOKENS=4096");

    expect(creds.removeEnvVar("ORCAROUTER_API_KEY")).toBe(true);
    contents = readFileSync(join(sandboxHome, ".agentmemory", ".env"), "utf-8");
    expect(contents).not.toContain("ORCAROUTER_API_KEY");
    expect(contents).toContain("ANTHROPIC_API_KEY=sk-ant-x");
  });

  it("falls back to a bare ORCAROUTER_API_KEY in the environment", async () => {
    process.env["ORCAROUTER_API_KEY"] = "sk-orca-fromenv00000000";
    const creds = await import("../src/orcarouter/credentials.js");
    const cred = creds.resolveCredential();
    expect(cred?.apiKey).toBe("sk-orca-fromenv00000000");
    expect(cred?.origin).toBe("env");
  });
});
