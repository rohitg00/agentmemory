// Unit tests for the doctor v2 diagnostic catalog.
//
// We exercise the data structure (every entry has check/fix/message),
// the pure parseEnvFile / realProviderKeys helpers, and the dry-run plan
// formatting. The full interactive prompt loop lives in src/cli.ts and is
// driven by clack — exercising it would require a TTY and is out of scope.

import { describe, it, expect } from "vitest";
import {
  buildDiagnostics,
  DIAGNOSTIC_IDS,
  dryRunPlan,
  parseEnvFile,
  placeholderProviderKeys,
  realProviderKeys,
  type DoctorContext,
  type DoctorEffects,
} from "../src/cli/doctor-diagnostics.js";

function stubCtx(overrides: Partial<DoctorContext> = {}): DoctorContext {
  return {
    baseUrl: "http://localhost:3111",
    viewerUrl: "http://localhost:3113",
    envPath: "/tmp/test/.agentmemory/.env",
    pidfilePath: "/tmp/test/.agentmemory/iii.pid",
    enginePath: "/tmp/test/.agentmemory/engine-state.json",
    pinnedVersion: "0.11.2",
    ...overrides,
  };
}

function stubEffects(overrides: Partial<DoctorEffects> = {}): DoctorEffects {
  return {
    envFileExists: () => true,
    readEnvFile: () => ({ ANTHROPIC_API_KEY: "sk-ant-real-key-value" }),
    processEnv: () => ({}),
    pidfileExists: () => false,
    pidfilePidIsAlive: () => null,
    findIiiBinary: () => "/Users/test/.local/bin/iii",
    localBinIiiPath: () => "/Users/test/.local/bin/iii",
    iiiBinaryVersion: () => "0.11.2",
    viewerReachable: async () => true,
    runInit: async () => ({ ok: true, message: "wrote .env" }),
    openEditor: async () => ({ ok: true, message: "saved" }),
    runIiiInstaller: async () => ({ ok: true, message: "installed" }),
    runStop: async () => ({ ok: true, message: "stopped" }),
    runStart: async () => ({ ok: true, message: "started" }),
    clearEnginePidAndState: () => {},
    ...overrides,
  };
}

describe("doctor v2 diagnostic catalog", () => {
  it("exports a stable list of diagnostic ids", () => {
    expect(DIAGNOSTIC_IDS).toContain("env-missing");
    expect(DIAGNOSTIC_IDS).toContain("no-llm-provider-key");
    expect(DIAGNOSTIC_IDS).toContain("engine-version-mismatch");
    expect(DIAGNOSTIC_IDS).toContain("viewer-unreachable");
    expect(DIAGNOSTIC_IDS).toContain("stale-pidfile");
    expect(DIAGNOSTIC_IDS).toContain("env-placeholder-keys");
    expect(DIAGNOSTIC_IDS).toContain("iii-on-path-not-local-bin");
  });

  it("every diagnostic has check, fix, message, and fixPreview", () => {
    const diagnostics = buildDiagnostics(stubEffects());
    expect(diagnostics.length).toBe(DIAGNOSTIC_IDS.length);
    for (const d of diagnostics) {
      expect(d.id).toMatch(/^[a-z][a-z0-9-]+$/);
      expect(d.message.length).toBeGreaterThan(0);
      expect(d.fixPreview.length).toBeGreaterThan(0);
      expect(d.moreInfo.length).toBeGreaterThan(0);
      expect(typeof d.check).toBe("function");
      expect(typeof d.fix).toBe("function");
    }
  });

  it("diagnostic ids are unique", () => {
    const diagnostics = buildDiagnostics(stubEffects());
    const ids = diagnostics.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("env-missing fails when env file is absent", async () => {
    const diagnostics = buildDiagnostics(stubEffects({ envFileExists: () => false }));
    const envCheck = diagnostics.find((d) => d.id === "env-missing")!;
    const status = await envCheck.check(stubCtx());
    expect(status.ok).toBe(false);
  });

  it("env-missing passes when env file exists", async () => {
    const diagnostics = buildDiagnostics(stubEffects({ envFileExists: () => true }));
    const envCheck = diagnostics.find((d) => d.id === "env-missing")!;
    const status = await envCheck.check(stubCtx());
    expect(status.ok).toBe(true);
  });

  it("no-llm-provider-key fails when env has only placeholders", async () => {
    const diagnostics = buildDiagnostics(
      stubEffects({
        envFileExists: () => true,
        readEnvFile: () => ({ ANTHROPIC_API_KEY: "your-key-here" }),
      }),
    );
    const check = diagnostics.find((d) => d.id === "no-llm-provider-key")!;
    const status = await check.check(stubCtx());
    expect(status.ok).toBe(false);
  });

  it("no-llm-provider-key passes when one real key is set", async () => {
    const diagnostics = buildDiagnostics(stubEffects());
    const check = diagnostics.find((d) => d.id === "no-llm-provider-key")!;
    const status = await check.check(stubCtx());
    expect(status.ok).toBe(true);
  });

  it("no-llm-provider-key passes when the agent-sdk fallback is enabled without a key", async () => {
    const diagnostics = buildDiagnostics(
      stubEffects({
        readEnvFile: () => parseEnvFile("AGENTMEMORY_ALLOW_AGENT_SDK=true   # opt in\n"),
      }),
    );
    const check = diagnostics.find((d) => d.id === "no-llm-provider-key")!;
    const status = await check.check(stubCtx());
    expect(status.ok).toBe(true);
    expect(status.detail).toContain("agent-sdk");
  });

  it("no-llm-provider-key fails when OPENAI_API_KEY is reserved for embeddings", async () => {
    const diagnostics = buildDiagnostics(
      stubEffects({
        readEnvFile: () =>
          parseEnvFile(
            "OPENAI_API_KEY=sk-real-openai-key\n" +
              "OPENAI_API_KEY_FOR_LLM=false                   # Skip OpenAI auto-detection for LLM; key stays active for embeddings\n",
          ),
      }),
    );
    const check = diagnostics.find((d) => d.id === "no-llm-provider-key")!;
    const status = await check.check(stubCtx());
    expect(status.ok).toBe(false);
  });

  it("no-llm-provider-key reports only the keys the daemon uses for the LLM", async () => {
    const statusFor = async (env: Record<string, string>) => {
      const diagnostics = buildDiagnostics(stubEffects({ readEnvFile: () => env }));
      const check = diagnostics.find((d) => d.id === "no-llm-provider-key")!;
      return check.check(stubCtx());
    };
    expect(await statusFor({ OPENAI_API_KEY: "sk-real-openai-key" })).toEqual({
      ok: true,
      detail: "found: OPENAI_API_KEY",
    });
    expect(
      await statusFor({
        ANTHROPIC_API_KEY: "sk-ant-real-key-value",
        OPENAI_API_KEY: "sk-real-openai-key",
        OPENAI_API_KEY_FOR_LLM: "false",
      }),
    ).toEqual({ ok: true, detail: "found: ANTHROPIC_API_KEY" });
  });

  describe("no-llm-provider-key with a process environment", () => {
    const statusFor = async (
      file: Record<string, string>,
      processEnv: Record<string, string | undefined>,
    ) => {
      const diagnostics = buildDiagnostics(
        stubEffects({ readEnvFile: () => file, processEnv: () => processEnv }),
      );
      const check = diagnostics.find((d) => d.id === "no-llm-provider-key")!;
      return check.check(stubCtx());
    };

    it("lets the environment override the same key in the file, as the daemon does", async () => {
      const reservedInFile = {
        OPENAI_API_KEY: "sk-real-openai-key",
        OPENAI_API_KEY_FOR_LLM: "false",
      };
      expect((await statusFor(reservedInFile, {})).ok).toBe(false);
      expect((await statusFor(reservedInFile, { OPENAI_API_KEY_FOR_LLM: "true" })).ok).toBe(true);
      expect(
        (await statusFor({ ANTHROPIC_API_KEY: "sk-ant-real-key-value" }, { ANTHROPIC_API_KEY: "" }))
          .ok,
      ).toBe(false);
    });

    it("names a key that only the environment provides, and says a daemon elsewhere misses it", async () => {
      expect(await statusFor({}, { ANTHROPIC_API_KEY: "sk-ant-real-key-value" })).toEqual({
        ok: true,
        detail:
          "found: ANTHROPIC_API_KEY (environment); a daemon started elsewhere will not see it",
      });
    });

    it("marks a key the environment overrides, not just one the file lacks", async () => {
      expect(
        await statusFor(
          { ANTHROPIC_API_KEY: "sk-ant-key-from-file" },
          { ANTHROPIC_API_KEY: "sk-ant-key-from-shell" },
        ),
      ).toEqual({
        ok: true,
        detail:
          "found: ANTHROPIC_API_KEY (environment); a daemon started elsewhere will not see it",
      });
    });

    it("leaves a file key unmarked when only an unrelated flag comes from the environment", async () => {
      const status = await statusFor(
        { OPENAI_API_KEY: "sk-real-openai-key", OPENAI_API_KEY_FOR_LLM: "false" },
        { OPENAI_API_KEY_FOR_LLM: "true" },
      );
      expect(status.ok).toBe(true);
      expect(status.detail).toBe("found: OPENAI_API_KEY");
    });

    it("ignores an undefined environment value instead of blanking the file key", async () => {
      expect(
        await statusFor({ ANTHROPIC_API_KEY: "sk-ant-real-key-value" }, {
          ANTHROPIC_API_KEY: undefined,
        }),
      ).toEqual({ ok: true, detail: "found: ANTHROPIC_API_KEY" });
    });

    it("counts an exported key when no env file exists, as the daemon does", async () => {
      const diagnostics = buildDiagnostics(
        stubEffects({
          envFileExists: () => false,
          readEnvFile: () => ({}),
          processEnv: () => ({ ANTHROPIC_API_KEY: "sk-ant-real-key-value" }),
        }),
      );
      const check = diagnostics.find((d) => d.id === "no-llm-provider-key")!;
      expect(await check.check(stubCtx())).toEqual({
        ok: true,
        detail:
          "found: ANTHROPIC_API_KEY (environment); a daemon started elsewhere will not see it",
      });
    });

    it("points at the env-missing fix when neither the file nor the environment has a key", async () => {
      const diagnostics = buildDiagnostics(
        stubEffects({
          envFileExists: () => false,
          readEnvFile: () => ({}),
          processEnv: () => ({}),
        }),
      );
      const check = diagnostics.find((d) => d.id === "no-llm-provider-key")!;
      const status = await check.check(stubCtx());
      expect(status.ok).toBe(false);
      expect(status.detail).toContain("env-missing");
      expect(await statusFor({}, {})).toEqual({ ok: false, detail: "no provider key set" });
    });

    it("keeps the agent-sdk label when the only key is reserved for embeddings", async () => {
      expect(
        await statusFor(
          { OPENAI_API_KEY: "sk-real-openai-key", OPENAI_API_KEY_FOR_LLM: "false" },
          { AGENTMEMORY_ALLOW_AGENT_SDK: "true" },
        ),
      ).toEqual({ ok: true, detail: "agent-sdk fallback, no API key" });
    });

    it("treats a placeholder exported in the environment as missing, unlike the daemon", async () => {
      expect(
        (
          await statusFor(
            { ANTHROPIC_API_KEY: "sk-ant-real-key-value" },
            { ANTHROPIC_API_KEY: "your-key-here" },
          )
        ).ok,
      ).toBe(false);
    });
  });

  it("engine-version-mismatch fails when iii reports the wrong version", async () => {
    const diagnostics = buildDiagnostics(
      stubEffects({ iiiBinaryVersion: () => "0.99.99" }),
    );
    const check = diagnostics.find((d) => d.id === "engine-version-mismatch")!;
    const status = await check.check(stubCtx());
    expect(status.ok).toBe(false);
    expect(status.detail).toContain("0.99.99");
    expect(status.detail).toContain("0.11.2");
  });

  it("engine-version-mismatch passes when iii matches pinned version", async () => {
    const diagnostics = buildDiagnostics(stubEffects());
    const check = diagnostics.find((d) => d.id === "engine-version-mismatch")!;
    const status = await check.check(stubCtx());
    expect(status.ok).toBe(true);
  });

  it("viewer-unreachable fails when viewer probe returns false", async () => {
    const diagnostics = buildDiagnostics(
      stubEffects({ viewerReachable: async () => false }),
    );
    const check = diagnostics.find((d) => d.id === "viewer-unreachable")!;
    const status = await check.check(stubCtx());
    expect(status.ok).toBe(false);
  });

  it("stale-pidfile passes when no pidfile exists", async () => {
    const diagnostics = buildDiagnostics(stubEffects({ pidfileExists: () => false }));
    const check = diagnostics.find((d) => d.id === "stale-pidfile")!;
    const status = await check.check(stubCtx());
    expect(status.ok).toBe(true);
  });

  it("stale-pidfile fails when pidfile points at a dead pid", async () => {
    const diagnostics = buildDiagnostics(
      stubEffects({ pidfileExists: () => true, pidfilePidIsAlive: () => false }),
    );
    const check = diagnostics.find((d) => d.id === "stale-pidfile")!;
    const status = await check.check(stubCtx());
    expect(status.ok).toBe(false);
    expect(status.detail).toBe("pid is gone");
  });

  it("env-placeholder-keys detects sk-ant-... placeholder", async () => {
    const diagnostics = buildDiagnostics(
      stubEffects({
        envFileExists: () => true,
        readEnvFile: () => ({ ANTHROPIC_API_KEY: "sk-ant-..." }),
      }),
    );
    const check = diagnostics.find((d) => d.id === "env-placeholder-keys")!;
    const status = await check.check(stubCtx());
    expect(status.ok).toBe(false);
    expect(status.detail).toContain("ANTHROPIC_API_KEY");
  });

  it("iii-on-path-not-local-bin warns when iii lives in another location", async () => {
    const diagnostics = buildDiagnostics(
      stubEffects({
        findIiiBinary: () => "/opt/homebrew/bin/iii",
        localBinIiiPath: () => "/Users/test/.local/bin/iii",
      }),
    );
    const check = diagnostics.find((d) => d.id === "iii-on-path-not-local-bin")!;
    const status = await check.check(stubCtx());
    expect(status.ok).toBe(false);
    expect(check.manualOnly).toBe(true);
  });

  it("dryRunPlan lists each failing diagnostic with the fix preview", () => {
    const diagnostics = buildDiagnostics(stubEffects());
    const results = diagnostics.map((d) => ({
      diagnostic: d,
      status: { ok: false, detail: "stub fail" },
    }));
    const lines = dryRunPlan(stubCtx(), results);
    expect(lines.some((l) => l.includes("env-missing"))).toBe(true);
    expect(lines.some((l) => l.includes("would fix:"))).toBe(true);
  });

  it("dryRunPlan reports all-passing state", () => {
    const diagnostics = buildDiagnostics(stubEffects());
    const results = diagnostics.map((d) => ({
      diagnostic: d,
      status: { ok: true },
    }));
    const lines = dryRunPlan(stubCtx(), results);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("All checks passing");
  });
});

describe("parseEnvFile", () => {
  it("strips comments and blank lines", () => {
    const env = parseEnvFile("# a comment\n\nFOO=bar\nBAZ=qux\n");
    expect(env).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("strips surrounding quotes", () => {
    const env = parseEnvFile(`A="hello"\nB='world'\nC=plain\n`);
    expect(env).toEqual({ A: "hello", B: "world", C: "plain" });
  });
});

describe("realProviderKeys / placeholderProviderKeys", () => {
  it("returns real keys only", () => {
    const env = {
      ANTHROPIC_API_KEY: "sk-ant-real-value",
      OPENAI_API_KEY: "sk-...",
      GEMINI_API_KEY: "",
      OPENROUTER_API_KEY: "your-key-here",
    };
    expect(realProviderKeys(env)).toEqual(["ANTHROPIC_API_KEY"]);
    expect(placeholderProviderKeys(env)).toContain("OPENAI_API_KEY");
    expect(placeholderProviderKeys(env)).toContain("OPENROUTER_API_KEY");
    expect(placeholderProviderKeys(env)).not.toContain("GEMINI_API_KEY");
  });

  it("treats xxx-style placeholders as fake", () => {
    expect(placeholderProviderKeys({ ANTHROPIC_API_KEY: "xxxx-xxxx" })).toEqual([
      "ANTHROPIC_API_KEY",
    ]);
  });
});
