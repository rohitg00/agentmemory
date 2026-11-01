import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("fresh native engine startup", () => {
  const source = readFileSync("src/cli.ts", "utf8");

  it("routes new iii engines through per-instance Worker Compose without reading legacy engine config files", () => {
    const start = source.indexOf("async function startIiiBin");
    const end = source.indexOf("function pickCompatibleIii", start);
    const body = source.slice(start, end);
    expect(body).toContain("startComposeDaemon(");
    expect(body).toContain("dataDir: dataDirResolution.dataDir");
    expect(body).toContain("restPort: getRestPort()");
    expect(body).toContain("viewerPort: getConfiguredViewerPort()");
    expect(body).toContain("enginePort: getEnginePort()");
    expect(body).not.toContain("prepareEngineLaunch(");
    expect(body).not.toContain("iii-config.runtime.yaml");
    expect(body).not.toContain("configPath");
    expect(source).not.toContain("findIiiConfig");
    expect(source).not.toContain("AGENTMEMORY_III_CONFIG");
  });

  it("reports captured startup stderr when engine or worker startup times out", () => {
    expect(source).toContain("function printCapturedStartupStderr()");
    expect(source).toContain("printCapturedStartupStderr()");
  });

  it("exports the complete derived port set for managed engine launchers", () => {
    expect(source).toContain(
      'process.env["III_VIEWER_PORT"] ??= String(restPort + 2)',
    );
    expect(source).toContain(
      'process.env["III_ENGINE_PORT"] ??= String(restPort + 46023)',
    );
    expect(source).toContain("new URL(configuredEngineUrl).port");
    expect(source).toContain(
      'process.env["III_ENGINE_PORT"] = parsedEnginePort',
    );
    expect(source).toContain(
      'process.env["AGENTMEMORY_METRICS_PORT"] ??= String(restPort + 6353)',
    );
    expect(source).toContain(
      'process.env["AGENTMEMORY_DATA_DIR"] = dataDirResolution.dataDir',
    );
  });

  it("checks every Unix engine installer prerequisite before downloading", () => {
    const installerStart = source.indexOf("async function runIiiInstaller");
    const installerEnd = source.indexOf("type StartupFailure", installerStart);
    const installerBody = source.slice(installerStart, installerEnd);
    expect(installerBody).toContain('whichBinary("sh")');
    expect(installerBody).toContain('whichBinary("curl")');
    expect(installerBody).toContain('whichBinary("tar")');
  });

  it("starts Worker Compose directly without preparing a legacy native config", () => {
    expect(source).not.toContain("function prepareEngineLaunch");
    expect(source).not.toContain("function adoptRunningEngine");
    expect(source).toContain("startComposeDaemon({");
    expect(source).toContain("await startWorkerForEngineState()");
  });

  it("stores lifecycle metadata per resolved instance", () => {
    expect(source).toContain('runtimeMetadataPath("iii.pid")');
    expect(source).toContain('kind: "compose"');
    expect(source).toContain("composePid: compose.child.pid");
    expect(source).toContain('runtimeMetadataPath("engine-state.json")');
    expect(source).toContain('runtimeMetadataPath("worker.pid")');
    expect(source).toContain('process.env["AGENTMEMORY_RUNTIME_DIR"] = selectedInstance > 0');
  });

  it("keeps AGENTMEMORY_URL client-only and lets local port flags win", () => {
    expect(source).toContain('const URL_CLIENT_COMMANDS = new Set(["status", "doctor", "mcp", "capture", "compression", "graph-index"])');
    expect(source).toContain("hasExplicitLocalPortOverride");
    expect(source).toContain("shouldUseAgentmemoryUrl()");
    expect(source).toContain('process.env["III_REST_PORT"] = String(base)');
  });

  it("routes persisted Docker state to the legacy recovery message without inspection", () => {
    const ownershipStart = source.indexOf("async function assertRuntimePortOwnership");
    const ownershipEnd = source.indexOf("function isInvokedViaNpx", ownershipStart);
    const ownershipBody = source.slice(ownershipStart, ownershipEnd);
    const dockerGuardStart = ownershipBody.indexOf('if (state.kind === "docker")');
    const dockerGuardEnd = ownershipBody.indexOf("  const ownerPort", dockerGuardStart);
    const dockerGuard = ownershipBody.slice(dockerGuardStart, dockerGuardEnd);
    expect(dockerGuard).toContain("legacyDockerStateMessage(state)");
    expect(dockerGuard).not.toContain("inspectOwnedDockerEngine");
    expect(dockerGuard).not.toContain("clearEngineState");
    expect(source).toContain("legacyDockerStateMessage(persistedState)");
  });

  it("keeps canonical compatibility without inspecting or mutating Docker ownership", () => {
    expect(source).toContain('function cliArgValue(name: string)');
    expect(source).toContain('arg.startsWith(`${name}=`)');
    expect(source).toContain("async function assertRuntimePortOwnership");
    expect(source).toContain("restPort: getRestPort()");
    expect(source).not.toContain("migrateLegacyRuntimeMetadata");
    expect(source).not.toContain("clearLegacyRuntimeMetadata");
  });

  it("rejects an unrecognized AGENTMEMORY_STATE_BACKEND before touching the engine", () => {
    const engineStart = source.indexOf("async function startEngine");
    const engineEnd = source.indexOf("async function waitForEngine", engineStart);
    const engineBody = source.slice(engineStart, engineEnd);
    expect(engineBody).toMatch(
      /try \{\s*stateBackendKind = getStateBackend\(\);\s*\} catch \(err\) \{\s*p\.log\.error\(err instanceof Error \? err\.message : String\(err\)\);\s*process\.exit\(1\);\s*\}/,
    );
    // The retired Docker-mode environment switch must not return to CLI startup.
    expect(engineBody).not.toContain("AGENTMEMORY_USE_DOCKER");
  });

  it("redacts credentials from the captured startup stderr output", () => {
    expect(source).toContain("function printCapturedStartupStderr()");
    expect(source).toContain("redactCredentialUrls(activeStartupStderr.text().trim())");
  });
});
