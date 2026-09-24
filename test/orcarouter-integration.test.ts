import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const ORIGINAL_HOME = process.env["HOME"];
const ORIGINAL_USERPROFILE = process.env["USERPROFILE"];

let sandboxHome: string;
const ROOT = join(import.meta.dirname, "..");

function readText(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf-8");
}

beforeEach(() => {
  sandboxHome = mkdtempSync(join(tmpdir(), "agentmemory-orca-rest-"));
  process.env["HOME"] = sandboxHome;
  process.env["USERPROFILE"] = sandboxHome;
  delete process.env["ORCAROUTER_API_KEY"];
  vi.resetModules();
});

afterEach(() => {
  process.env["HOME"] = ORIGINAL_HOME;
  if (ORIGINAL_USERPROFILE === undefined) delete process.env["USERPROFILE"];
  else process.env["USERPROFILE"] = ORIGINAL_USERPROFILE;
  rmSync(sandboxHome, { recursive: true, force: true });
});

describe("REST surface", () => {
  const api = readText("src/triggers/api.ts");

  it("registers the credential and catalog endpoints", () => {
    for (const path of [
      "/agentmemory/orcarouter/status",
      "/agentmemory/orcarouter/key",
      "/agentmemory/orcarouter/connect/start",
      "/agentmemory/orcarouter/connect/status",
      "/agentmemory/orcarouter/connect/cancel",
      "/agentmemory/orcarouter/signout",
      "/agentmemory/orcarouter/models",
    ]) {
      expect(api).toContain(`api_path: "${path}"`);
    }
  });

  it("guards every OrcaRouter endpoint with the auth middleware", () => {
    const block = api.slice(api.indexOf("function registerOrcaRouterTriggers"));
    const triggers = block.split("sdk.registerTrigger").slice(1);
    expect(triggers.length).toBeGreaterThanOrEqual(7);
    for (const trigger of triggers) {
      expect(trigger.slice(0, 400)).toContain("middleware::api-auth");
    }
  });

  it("never returns the raw key from the status or models endpoints", () => {
    const block = api.slice(
      api.indexOf("function registerOrcaRouterTriggers"),
      api.indexOf("function registerOrcaRouterTriggers") + 7000,
    );
    // The status endpoint masks; nothing in the surface hands back apiKey.
    expect(block).toContain("maskSecret(credential.apiKey)");
    expect(block).not.toMatch(/apiKey:\s*credential\.apiKey/);
    expect(block).not.toMatch(/apiKey:\s*resolveCredential/);
  });

  it("filters model options through the shared capability layer", () => {
    expect(api).toContain("filterModels(catalog.models, capability, inputModality)");
    // The supported set is not duplicated inline in the handler.
    expect(api).toContain("supportedCapabilities()");
  });

  it("keeps the documented REST endpoint count in lockstep", () => {
    const registered = Array.from(api.matchAll(/api_path:\s*["`]/g)).length;
    expect(registered).toBeGreaterThan(0);
    expect(readText("README.md")).toContain(`${registered} endpoints on port`);
    expect(readText("AGENTS.md")).toContain(`${registered} REST endpoints`);
    expect(readText("src/index.ts")).toContain(`REST API: ${registered} endpoints`);
  });
});

describe("viewer GUI", () => {
  const html = readText("src/viewer/index.html");

  it("exposes both authentication choices side by side", () => {
    expect(html).toContain('data-orca-method="api-key"');
    expect(html).toContain('data-orca-method="pkce"');
    expect(html).toContain("OrcaRouter - API");
    expect(html).toContain("OrcaRouter - Auth");
    expect(html).toContain("Connect with OrcaRouter");
    expect(html).toContain('id="orca-api-key"');
  });

  it("renders one capability-filtered selector per AI entry point", () => {
    expect(html).toContain("orcaModelField('chat'");
    expect(html).toContain("orcaModelField('multimodal'");
    expect(html).toContain("orcaModelField('embedding'");
    // Multimodal asks the backend for image-input models explicitly.
    expect(html).toContain("inputModality=image");
    // The selector is a real listbox the backend populates, never a
    // free-text model field.
    expect(html).toContain('class="orca-combo-trigger"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain("orcaOptionHtml(capability, m, selected)");
    expect(html).not.toMatch(/orca-model-input|modelTextInput/);
    expect(html).not.toMatch(/<input[^>]*id="orca-model/);
  });

  it("self-hosts the official logo instead of hotlinking it (CSP img-src 'self')", () => {
    expect(html).toContain('src="/orca-logo.png"');
    expect(html).not.toContain("www.orcarouter.ai/orca-logo");
    expect(readText("src/auth.ts")).toContain("\"img-src 'self'\"");
  });

  it("releases busy state and hint synchronously on pagehide", () => {
    // The pagehide handler must clear state itself rather than relying on a
    // guarded finally, which correctly refuses to mutate after invalidation.
    const start = html.indexOf("function orcaReleaseOnPageHide");
    expect(start).toBeGreaterThan(-1);
    const body = html.slice(start, start + 1400);
    expect(body).toContain("orcaNextGeneration()");
    expect(body).toContain("orcaStopPolling()");
    expect(body).toContain("orca().busy = false");
    expect(body).toContain("orca().hint = ''");
    expect(body).toContain("keepalive: true");
    // State alone is not enough: the restored page shows whatever the DOM
    // holds, so the busy affordances are cleared synchronously too.
    expect(body).toContain("orcaClearBusyDom()");
    const domRelease = html.slice(
      html.indexOf("function orcaClearBusyDom"),
      html.indexOf("function orcaReleaseOnPageHide"),
    );
    expect(domRelease).toContain("connect.disabled = false");
    expect(domRelease).toContain("cancel.disabled = true");
    expect(domRelease).toContain("removeChild");
    // Registered on both lifecycle events.
    expect(html).toContain("window.addEventListener('pagehide', orcaReleaseOnPageHide)");
    expect(html).toContain("window.addEventListener('beforeunload', orcaReleaseOnPageHide)");
  });

  it("guards every async continuation with the attempt generation", () => {
    const controller = html.slice(
      html.indexOf("function orcaNextGeneration"),
      html.indexOf("async function loadTab"),
    );
    // Every poll tick and every awaited call checks currency.
    expect(controller).toContain("function orcaIsCurrent");
    expect((controller.match(/orcaIsCurrent\(gen\)/g) ?? []).length).toBeGreaterThanOrEqual(5);
    // A cancel bumps the generation so in-flight responses go stale.
    expect(controller).toContain("async function orcaCancel");
    expect(controller).toContain("orcaNextGeneration();");
  });

  it("clears a selected model that is no longer compatible", () => {
    const body = html.slice(
      html.indexOf("function orcaRenderModelFields"),
      html.indexOf("function orcaMetaText"),
    );
    expect(body).toContain("options.some(function(m) { return m.id === selected; })");
    expect(body).toContain("orca().selected[capability] = ''");
  });

  it("labels a degraded catalog instead of passing the seed off as live", () => {
    const body = html.slice(
      html.indexOf("function orcaRenderModelFields"),
      html.indexOf("function orcaMetaText"),
    );
    expect(body).toContain("entry.degraded");
    expect(body).toContain("verified fallback list, not the live workspace catalog");
  });

  it("masks the key in the status line and never echoes the input value", () => {
    const body = html.slice(
      html.indexOf("function orcaCredentialLine"),
      html.indexOf("function renderSettings"),
    );
    expect(body).toContain("st.keyMasked");
    expect(body).not.toContain("st.apiKey");
  });
});

describe("CLI", () => {
  const cli = readText("src/cli.ts");

  it("offers both authentication paths as discoverable subcommands", () => {
    expect(cli).toContain('sub === "login"');
    expect(cli).toContain('sub === "key"');
    expect(cli).toContain("orcarouter: runOrcaRouterCmd");
    expect(cli).toContain("OAuth 2.0 + PKCE");
    expect(cli).toContain("sk-orca-");
  });

  it("uses the shared credential seam rather than its own storage", () => {
    expect(cli).toContain('await import("./orcarouter/credentials.js")');
    expect(cli).toContain("maskSecret");
    expect(cli).toContain("clearCredential");
    // No private key file or ad-hoc secret store for OrcaRouter.
    expect(cli).not.toContain("orca-key.json");
  });
});

describe("compliance self-checks", () => {
  const files = [
    "src/orcarouter/origins.ts",
    "src/orcarouter/pkce.ts",
    "src/orcarouter/credentials.ts",
    "src/orcarouter/connect.ts",
    "src/orcarouter/catalog.ts",
    "src/orcarouter/catalog-cache.ts",
    "src/providers/orcarouter.ts",
    "src/providers/embedding/orcarouter.ts",
  ];

  it("contains no client secret and no fixed verifier", () => {
    for (const file of files) {
      const text = readText(file);
      expect(text).not.toMatch(/client_secret/i);
      expect(text).not.toMatch(/code_verifier\s*[:=]\s*["'][A-Za-z0-9_-]{20,}["']/);
      // No hardcoded real key material.
      expect(text).not.toMatch(/sk-orca-[A-Za-z0-9]{20,}/);
    }
  });

  it("never calls the wrong /v1/auth/keys path in implementation code", () => {
    for (const file of files) {
      const text = readText(file);
      // The relay is at /v1; auth is at /api/v1/auth. The bug is a path that
      // reaches /v1/auth/keys without the /api prefix.
      expect(text).not.toMatch(/[^i]\/v1\/auth\/keys/);
    }
  });

  it("keeps auth on www and inference on api in every non-test file", () => {
    const pkce = readText("src/orcarouter/pkce.ts");
    const origins = readText("src/orcarouter/origins.ts");
    expect(origins).toContain('DEFAULT_AUTH_BASE_URL = "https://www.orcarouter.ai"');
    expect(origins).toContain('DEFAULT_API_BASE_URL = "https://api.orcarouter.ai"');
    // The exchange helper builds its URL from the auth origin only.
    expect(pkce).toContain("exchangeUrl(opts.origins)");
    expect(pkce).not.toContain("apiBaseUrl}/api/v1/auth");
  });

  it("uses S256 everywhere and never plain", () => {
    const pkce = readText("src/orcarouter/pkce.ts");
    expect(pkce).toContain('code_challenge_method", "S256"');
    expect(pkce).not.toMatch(/code_challenge_method["'],\s*["']plain/);
    expect(pkce).not.toContain('"plain"');
  });

  it("registers the provider as a first-class named provider", () => {
    expect(readText("src/types.ts")).toContain('"orcarouter"');
    expect(readText("src/config.ts")).toContain('provider: "orcarouter"');
    expect(readText("src/config.ts")).toContain('env["ORCAROUTER_API_KEY"]');
    expect(readText("src/providers/index.ts")).toContain('case "orcarouter"');
    expect(readText("src/providers/index.ts")).toContain("createOrcaRouterProvider");
    expect(readText("src/cli/onboarding.ts")).toContain('"orcarouter"');
  });

  it("does not introduce any new runtime dependency", () => {
    const pkg = JSON.parse(readText("package.json"));
    const deps = Object.keys(pkg.dependencies).sort();
    expect(deps).toEqual(
      [
        "@anthropic-ai/claude-agent-sdk",
        "@anthropic-ai/sdk",
        "@clack/prompts",
        "dotenv",
        "iii-sdk",
        "picocolors",
        "zod",
      ].sort(),
    );
  });

  it("documents the provider surface in the env template", () => {
    const envExample = readText(".env.example");
    expect(envExample).toContain("ORCAROUTER_API_KEY");
    expect(envExample).toContain("ORCA_AUTH_BASE_URL");
    expect(envExample).toContain("ORCA_API_BASE_URL");
    expect(envExample).toContain("ORCA_BASE_URL");
  });
});
