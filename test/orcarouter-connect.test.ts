import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGINAL_HOME = process.env["HOME"];
const ORIGINAL_USERPROFILE = process.env["USERPROFILE"];

let sandboxHome: string;

beforeEach(() => {
  sandboxHome = mkdtempSync(join(tmpdir(), "agentmemory-orca-e2e-"));
  process.env["HOME"] = sandboxHome;
  process.env["USERPROFILE"] = sandboxHome;
  for (const k of [
    "ORCA_BASE_URL",
    "ORCA_AUTH_BASE_URL",
    "ORCA_API_BASE_URL",
    "ORCAROUTER_API_KEY",
    "ORCAROUTER_MODEL",
  ]) {
    delete process.env[k];
  }
  vi.resetModules();
});

afterEach(() => {
  process.env["HOME"] = ORIGINAL_HOME;
  if (ORIGINAL_USERPROFILE === undefined) delete process.env["USERPROFILE"];
  else process.env["USERPROFILE"] = ORIGINAL_USERPROFILE;
  rmSync(sandboxHome, { recursive: true, force: true });
});

/**
 * A local stand-in for the OrcaRouter auth origin. The real flow needs a human
 * to approve on the consent screen, so the automated tests drive the same
 * adapter against this server instead — the adapter itself is unchanged.
 */
interface FakeAuth {
  server: Server;
  origin: string;
  exchangeRequests: Array<Record<string, unknown>>;
  /** Consent-screen parameters the client sent, captured per authorize call. */
  authorizeParams: URLSearchParams[];
  close: () => Promise<void>;
}

async function startFakeAuth(opts: {
  scope?: string;
  exchangeStatus?: number;
  onAuthorize?: (params: URLSearchParams) => void;
}): Promise<FakeAuth> {
  const exchangeRequests: Array<Record<string, unknown>> = [];
  const authorizeParams: URLSearchParams[] = [];

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");

      // The browser-facing consent screen. A real one renders a form; this one
      // records what the client asked for and immediately "approves".
      if (req.method === "GET" && url.pathname === "/auth") {
        authorizeParams.push(url.searchParams);
        opts.onAuthorize?.(url.searchParams);
        const callback = url.searchParams.get("callback_url");
        const state = url.searchParams.get("state") ?? "";
        if (callback && callback !== "oob") {
          const target = new URL(callback);
          target.searchParams.set("code", "auth-code-from-consent");
          target.searchParams.set("state", state);
          // Simulate the browser following the redirect.
          fetch(target.toString()).catch(() => {});
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<p>consent</p>");
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/v1/auth/keys") {
        let body: Record<string, unknown> = {};
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          body = Object.fromEntries(new URLSearchParams(raw));
        }
        exchangeRequests.push(body);
        const status = opts.exchangeStatus ?? 200;
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify(
            status === 200
              ? {
                  key: "sk-orca-issuedbypkce123",
                  user_id: "99887766",
                  scope: opts.scope ?? "api",
                }
              : { error: "invalid_grant" },
          ),
        );
        return;
      }

      res.writeHead(404).end();
    });
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const port = addr && typeof addr === "object" ? addr.port : 0;
  return {
    server,
    origin: `http://127.0.0.1:${port}`,
    exchangeRequests,
    authorizeParams,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

describe("PKCE connect end to end through the connect adapter", () => {
  it("runs authorize -> loopback callback -> exchange -> persist", async () => {
    const fake = await startFakeAuth({});
    try {
      const { startConnect, waitForConnect, __resetConnectState } = await import(
        "../src/orcarouter/connect.js"
      );
      const creds = await import("../src/orcarouter/credentials.js");
      __resetConnectState();

      const started = await startConnect({
        origins: { authBaseUrl: fake.origin, apiBaseUrl: "https://api.orcarouter.ai" },
      });

      // The authorize URL points at the fake auth origin and carries S256.
      const authorize = new URL(started.authorizeUrl);
      expect(authorize.origin).toBe(fake.origin);
      expect(authorize.pathname).toBe("/auth");
      expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
      expect(authorize.searchParams.get("code_challenge")).toBeTruthy();
      expect(authorize.searchParams.get("callback_url")).toMatch(
        /^http:\/\/127\.0\.0\.1:\d+\/cb$/,
      );
      expect(authorize.searchParams.get("scope")).toBe("api");

      // Simulate the user approving: fetch the consent screen, which redirects
      // the code back to the loopback listener the adapter opened.
      await fetch(started.authorizeUrl);

      const credential = await waitForConnect(started.attemptId);
      expect(credential.apiKey).toBe("sk-orca-issuedbypkce123");
      expect(credential.origin).toBe("pkce");
      expect(credential.userId).toBe("99887766");
      expect(credential.scope).toBe("api");
      expect(credential.status).toBe("ok");

      // The exchange carried the verifier and the S256 method, on the auth
      // origin — never the relay.
      expect(fake.exchangeRequests).toHaveLength(1);
      expect(fake.exchangeRequests[0]).toMatchObject({
        code: "auth-code-from-consent",
        code_challenge_method: "S256",
      });
      const verifier = fake.exchangeRequests[0]!["code_verifier"] as string;
      expect(verifier).toBeTruthy();

      // The verifier never rode on the authorize URL.
      expect(started.authorizeUrl).not.toContain(verifier);

      // The key is persisted where every other provider secret lives.
      const contents = readFileSync(
        join(sandboxHome, ".agentmemory", ".env"),
        "utf-8",
      );
      expect(contents).toContain("ORCAROUTER_API_KEY=sk-orca-issuedbypkce123");
      expect(contents).not.toContain(verifier);

      // And it resolves through the same seam the API-key adapter uses.
      creds.__resetCredentialCache();
      const resolved = creds.resolveCredential()!;
      expect(resolved.apiKey).toBe("sk-orca-issuedbypkce123");
      expect(resolved.origin).toBe("pkce");
    } finally {
      await fake.close();
    }
  });

  it("uses a different verifier and state on every attempt", async () => {
    const fake = await startFakeAuth({});
    try {
      const { startConnect, waitForConnect, __resetConnectState } = await import(
        "../src/orcarouter/connect.js"
      );
      __resetConnectState();
      const origins = {
        authBaseUrl: fake.origin,
        apiBaseUrl: "https://api.orcarouter.ai",
      };

      const first = await startConnect({ origins });
      await fetch(first.authorizeUrl);
      await waitForConnect(first.attemptId);

      const second = await startConnect({ origins });
      await fetch(second.authorizeUrl);
      await waitForConnect(second.attemptId);

      const [a, b] = fake.exchangeRequests.map((r) => r["code_verifier"]);
      expect(a).toBeTruthy();
      expect(b).toBeTruthy();
      expect(a).not.toBe(b);

      const stateOne = new URL(first.authorizeUrl).searchParams.get("state");
      const stateTwo = new URL(second.authorizeUrl).searchParams.get("state");
      expect(stateOne).not.toBe(stateTwo);
    } finally {
      await fake.close();
    }
  });

  it("ends cleanly on denial instead of hanging", async () => {
    const fake = await startFakeAuth({});
    try {
      const { startConnect, waitForConnect, connectStatus, __resetConnectState } =
        await import("../src/orcarouter/connect.js");
      __resetConnectState();

      const started = await startConnect({
        origins: { authBaseUrl: fake.origin, apiBaseUrl: "https://api.orcarouter.ai" },
      });

      // The user clicks "deny": the consent screen redirects with error=.
      const state = new URL(started.authorizeUrl).searchParams.get("state")!;
      const callback = new URL(started.callbackUrl);
      callback.searchParams.set("error", "access_denied");
      callback.searchParams.set("state", state);
      await fetch(callback.toString());

      const err = await waitForConnect(started.attemptId).catch((e) => e);
      expect(err.kind).toBe("denied");

      const status = connectStatus(started.attemptId)!;
      expect(status.phase).toBe("failed");
      expect(status.error?.kind).toBe("denied");
      // The lock is released, and no credential was written.
      expect(connectStatus()?.phase ?? "idle").not.toBe("awaiting_browser");
    } finally {
      await fake.close();
    }
  });

  it("rejects a mismatched state delivered to the loopback listener", async () => {
    const fake = await startFakeAuth({});
    try {
      const { startConnect, waitForConnect, __resetConnectState } = await import(
        "../src/orcarouter/connect.js"
      );
      __resetConnectState();
      const started = await startConnect({
        origins: { authBaseUrl: fake.origin, apiBaseUrl: "https://api.orcarouter.ai" },
      });

      const callback = new URL(started.callbackUrl);
      callback.searchParams.set("code", "attacker-supplied-code");
      callback.searchParams.set("state", "not-the-right-state");
      await fetch(callback.toString());

      const err = await waitForConnect(started.attemptId).catch((e) => e);
      expect(err.kind).toBe("state_mismatch");
    } finally {
      await fake.close();
    }
  });

  it("surfaces a rejected exchange (403, expired or reused code) as terminal", async () => {
    const fake = await startFakeAuth({ exchangeStatus: 403 });
    try {
      const { startConnect, waitForConnect, __resetConnectState } = await import(
        "../src/orcarouter/connect.js"
      );
      __resetConnectState();
      const started = await startConnect({
        origins: { authBaseUrl: fake.origin, apiBaseUrl: "https://api.orcarouter.ai" },
      });
      await fetch(started.authorizeUrl);

      const err = await waitForConnect(started.attemptId).catch((e) => e);
      expect(err.kind).toBe("code_rejected");

      // Nothing was stored, and the old credential (if any) is untouched.
      const creds = await import("../src/orcarouter/credentials.js");
      creds.__resetCredentialCache();
      expect(creds.resolveCredential()).toBeNull();
    } finally {
      await fake.close();
    }
  });

  it("cancels a pending attempt and releases the login lock", async () => {
    const fake = await startFakeAuth({});
    try {
      const { startConnect, waitForConnect, cancelConnect, isBusy, __resetConnectState } =
        await import("../src/orcarouter/connect.js");
      __resetConnectState();

      const started = await startConnect({
        origins: { authBaseUrl: fake.origin, apiBaseUrl: "https://api.orcarouter.ai" },
      });
      expect(isBusy()).toBe(true);

      expect(cancelConnect(started.attemptId)).toBe(true);
      expect(isBusy()).toBe(false);

      const err = await waitForConnect(started.attemptId).catch((e) => e);
      expect(err.kind).toBe("canceled");
    } finally {
      await fake.close();
    }
  });

  it("lets a second login start after a cancel, without remounting", async () => {
    const fake = await startFakeAuth({});
    try {
      const { startConnect, waitForConnect, cancelConnect, __resetConnectState } =
        await import("../src/orcarouter/connect.js");
      __resetConnectState();
      const origins = {
        authBaseUrl: fake.origin,
        apiBaseUrl: "https://api.orcarouter.ai",
      };

      const first = await startConnect({ origins });
      cancelConnect(first.attemptId);
      await waitForConnect(first.attemptId).catch(() => {});

      const second = await startConnect({ origins });
      await fetch(second.authorizeUrl);
      const credential = await waitForConnect(second.attemptId);
      expect(credential.apiKey).toBe("sk-orca-issuedbypkce123");
    } finally {
      await fake.close();
    }
  });

  it("stops a superseded attempt from surfacing under a newer generation", async () => {
    const fake = await startFakeAuth({});
    try {
      const { startConnect, waitForConnect, connectStatus, __resetConnectState } =
        await import("../src/orcarouter/connect.js");
      __resetConnectState();
      const origins = {
        authBaseUrl: fake.origin,
        apiBaseUrl: "https://api.orcarouter.ai",
      };

      const first = await startConnect({ origins });
      // Start a second attempt without cancelling the first: superseding is
      // implicit, and the older attempt must not be able to write state.
      const second = await startConnect({ origins });
      expect(second.attemptId).not.toBe(first.attemptId);

      await fetch(second.authorizeUrl);
      await waitForConnect(second.attemptId);

      // The superseded attempt terminated as cancelled, not succeeded.
      const firstStatus = connectStatus(first.attemptId)!;
      expect(firstStatus.phase).toBe("failed");
      expect(firstStatus.error?.kind).toBe("canceled");
    } finally {
      await fake.close();
    }
  });

  it("never returns the verifier or key through the status view", async () => {
    const fake = await startFakeAuth({});
    try {
      const { startConnect, waitForConnect, connectStatus, __resetConnectState } =
        await import("../src/orcarouter/connect.js");
      __resetConnectState();
      const started = await startConnect({
        origins: { authBaseUrl: fake.origin, apiBaseUrl: "https://api.orcarouter.ai" },
      });

      const pending = JSON.stringify(connectStatus(started.attemptId));
      expect(pending).not.toContain("code_verifier");
      // The challenge is public (it rides the authorize URL); the verifier is
      // what must never appear. Assert it is absent by shape: the only
      // 43-char base64url tokens in the payload must be the challenge — the
      // verifier is 43 chars too, so a leak would show up as an extra one.
      const challenge = new URL(started.authorizeUrl).searchParams.get(
        "code_challenge",
      )!;
      const wide = pending.match(/[A-Za-z0-9_-]{43}/g) ?? [];
      expect(wide).toEqual([challenge]);
      // The state is 22 chars and is safe to expose — it is the CSRF token,
      // not a secret.
      const state = new URL(started.authorizeUrl).searchParams.get("state")!;
      expect(pending).toContain(state);

      await fetch(started.authorizeUrl);
      await waitForConnect(started.attemptId);
      const done = JSON.stringify(connectStatus(started.attemptId));
      expect(done).not.toContain("sk-orca-issuedbypkce123");
      expect(done).toContain("sk-orca…");
    } finally {
      await fake.close();
    }
  });
});

describe("credential lifecycle: 401 recovery is generation-safe", () => {
  it("marks only the exact rejected generation, never a newer one", async () => {
    const creds = await import("../src/orcarouter/credentials.js");

    const first = creds.persistPkceCredential({
      apiKey: "sk-orca-generationone00",
      userId: "1",
      scope: "api",
    });
    expect(first.generation).toBeGreaterThan(0);
    const rejectedGeneration = first.generation;

    // The user re-authorizes before the late 401 from the old key arrives.
    const second = creds.persistPkceCredential({
      apiKey: "sk-orca-generationtwo00",
      userId: "1",
      scope: "api",
    });
    expect(second.generation).toBe(rejectedGeneration + 1);

    // A stale failure must not touch the new credential.
    const changed = creds.markNeedsReauth({
      generation: rejectedGeneration,
      reason: "late 401 from the previous key",
    });
    expect(changed).toBe(false);
    expect(creds.resolveCredential()!.status).toBe("ok");
    expect(creds.resolveCredential()!.apiKey).toBe("sk-orca-generationtwo00");
  });

  it("marks the current generation and keeps the key rather than deleting it", async () => {
    const creds = await import("../src/orcarouter/credentials.js");
    const credential = creds.persistPkceCredential({
      apiKey: "sk-orca-revokedkey0000",
      userId: "7",
      scope: "api",
    });

    expect(
      creds.markNeedsReauth({
        generation: credential.generation,
        reason: "revoked from the console",
      }),
    ).toBe(true);

    const after = creds.resolveCredential()!;
    expect(after.status).toBe("needsReauth");
    expect(after.needsReauthReason).toContain("revoked");
    // Retained: a transient misclassification must not destroy the credential.
    expect(after.apiKey).toBe("sk-orca-revokedkey0000");
    expect(creds.hasCredential()).toBe(false);
  });

  it("clears needsReauth when a fresh login succeeds", async () => {
    const creds = await import("../src/orcarouter/credentials.js");
    const credential = creds.persistPkceCredential({ apiKey: "sk-orca-firstlogin000" });
    creds.markNeedsReauth({
      generation: credential.generation,
      reason: "rejected",
    });
    expect(creds.resolveCredential()!.status).toBe("needsReauth");

    const relogin = creds.persistPkceCredential({ apiKey: "sk-orca-secondlogin00" });
    expect(relogin.status).toBe("ok");
    expect(relogin.generation).toBe(credential.generation + 1);
    expect(creds.resolveCredential()!.apiKey).toBe("sk-orca-secondlogin00");
  });

  it("is a no-op when there is no stored credential to mark", async () => {
    const creds = await import("../src/orcarouter/credentials.js");
    expect(creds.markNeedsReauth({ generation: 1, reason: "x" })).toBe(false);
  });

  it("does not schedule or attempt any refresh grant", async () => {
    // A PKCE-issued key is durable, not a refresh token. The strongest
    // available proof is that nothing in the module can mint a grant: there is
    // no refresh endpoint constant and no refresh call site.
    const source = readFileSync(
      join(process.cwd(), "src", "orcarouter", "credentials.ts"),
      "utf-8",
    );
    expect(source).not.toMatch(/refresh_token|grant_type|refresh/i);
    const pkceSource = readFileSync(
      join(process.cwd(), "src", "orcarouter", "pkce.ts"),
      "utf-8",
    );
    expect(pkceSource).not.toMatch(/refresh_token/);
    expect(pkceSource).not.toMatch(/grant_type/);
  });
});

describe("provider wiring", () => {
  it("refuses to construct without a credential, and accepts either adapter's key", async () => {
    const creds = await import("../src/orcarouter/credentials.js");
    const { createOrcaRouterProvider } = await import(
      "../src/providers/orcarouter.js"
    );

    expect(() => createOrcaRouterProvider("orcarouter/auto", 100)).toThrow(
      /ORCAROUTER_API_KEY/,
    );

    // Whichever adapter supplied it, the provider sees an ordinary key.
    creds.connectWithApiKey("sk-orca-viaapikey000000");
    const viaKey = createOrcaRouterProvider("orcarouter/auto", 100);
    expect(viaKey).toBeInstanceOf(Object);

    creds.persistPkceCredential({ apiKey: "sk-orca-viapkce0000000" });
    const viaPkce = createOrcaRouterProvider("orcarouter/auto", 100);
    expect(viaPkce).toBeInstanceOf(Object);
  });

  it("sends inference to the API origin with Bearer auth, and marks the exact generation on 401", async () => {
    const creds = await import("../src/orcarouter/credentials.js");
    const { OrcaRouterProvider, OrcaRouterAuthRejection } = await import(
      "../src/providers/orcarouter.js"
    );

    const credential = creds.persistPkceCredential({
      apiKey: "sk-orca-willberevoked00",
      userId: "5",
      scope: "api",
    });

    const calls: Array<{ url: string; auth: string | null }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({
        url: String(url),
        auth: new Headers(init.headers).get("Authorization"),
      });
      return new Response(JSON.stringify({ error: "revoked" }), { status: 401 });
    }) as typeof fetch;

    try {
      const provider = new OrcaRouterProvider(
        credential.apiKey,
        "orcarouter/auto",
        100,
        "https://api.orcarouter.ai/v1/chat/completions",
        credential.generation,
      );

      const err = await provider.compress("sys", "user").catch((e) => e);
      expect(err).toBeInstanceOf(OrcaRouterAuthRejection);
      expect(err.credentialGeneration).toBe(credential.generation);

      // Inference goes to the relay, never to the auth origin.
      expect(calls[0]!.url).toBe("https://api.orcarouter.ai/v1/chat/completions");
      expect(calls[0]!.url).not.toContain("www.orcarouter.ai");
      expect(calls[0]!.auth).toBe("Bearer sk-orca-willberevoked00");

      // The rejection is terminal and carries no key material in its message.
      expect(err.message).not.toContain("sk-orca-willberevoked00");
      expect(err.message).toMatch(/reconnect/i);

      // The exact account+generation is now flagged for reauthentication.
      const after = creds.resolveCredential()!;
      expect(after.status).toBe("needsReauth");
      expect(after.generation).toBe(credential.generation);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("routes describeImage through the same OpenAI-compatible endpoint", async () => {
    const { OrcaRouterProvider } = await import("../src/providers/orcarouter.js");
    const seen: Array<Record<string, unknown>> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      seen.push(JSON.parse(String(init.body)));
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "a red square" } }] }),
        { status: 200 },
      );
    }) as typeof fetch;

    try {
      const provider = new OrcaRouterProvider(
        "sk-orca-testkey123456",
        "openai/gpt-5.5",
        256,
        "https://api.orcarouter.ai/v1/chat/completions",
      );
      const out = await provider.describeImage("ZmFrZQ==", "image/png", "what is this?");
      expect(out).toBe("a red square");

      const messages = seen[0]!["messages"] as Array<{ content: unknown[] }>;
      const parts = messages[0]!.content as Array<Record<string, unknown>>;
      expect(parts[0]).toMatchObject({ type: "text" });
      expect(parts[1]).toMatchObject({
        type: "image_url",
        image_url: { url: "data:image/png;base64,ZmFrZQ==" },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // A gateway can route to thinking models, which answer with reasoning and an
  // empty `content`. Treating that as malformed would make a whole class of
  // OrcaRouter-routed models look broken; the OpenAI provider already falls
  // back the same way.
  it("falls back to reasoning text when a routed model returns no content", async () => {
    const { OrcaRouterProvider } = await import("../src/providers/orcarouter.js");
    const originalFetch = globalThis.fetch;
    const bodies: Array<Record<string, unknown>> = [
      { choices: [{ message: { content: "", reasoning_content: "thinking out loud" } }] },
      { choices: [{ message: { content: "", reasoning: "older o-series shape" } }] },
    ];
    let call = 0;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(bodies[call++]), { status: 200 })) as typeof fetch;

    try {
      const provider = new OrcaRouterProvider(
        "sk-orca-testkey123456",
        "deepseek/deepseek-v4-pro",
        256,
        "https://api.orcarouter.ai/v1/chat/completions",
      );
      expect(await provider.compress("s", "u")).toBe("thinking out loud");
      expect(await provider.compress("s", "u")).toBe("older o-series shape");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("still reports a genuinely malformed response instead of returning nothing", async () => {
    const { OrcaRouterProvider } = await import("../src/providers/orcarouter.js");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ choices: [{ message: {} }] }), {
        status: 200,
      })) as typeof fetch;

    try {
      const provider = new OrcaRouterProvider(
        "sk-orca-testkey123456",
        "deepseek/deepseek-v4-pro",
        256,
        "https://api.orcarouter.ai/v1/chat/completions",
      );
      await expect(provider.compress("s", "u")).rejects.toThrow(
        /unexpected response/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
