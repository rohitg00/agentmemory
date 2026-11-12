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

  it("retries a timed-out iii --version probe with a longer timeout before treating the binary as missing", () => {
    const start = source.indexOf("function probeIiiVersion");
    const body = source.slice(start, source.indexOf("\n}\n", start));
    expect(source).toContain("const III_VERSION_PROBE_TIMEOUTS_MS = [3000, 30000]");
    expect(body).toContain("for (const timeout of III_VERSION_PROBE_TIMEOUTS_MS)");
    expect(body).toContain("if (!isProbeTimeout(err)) return null;");
  });

  it("probes each iii path at most once per startEngine scan and re-probes on the next scan", () => {
    const start = source.indexOf("function iiiBinVersion");
    const body = source.slice(start, source.indexOf("\n}\n", start));
    expect(body).toContain("if (iiiProbeScan?.has(binPath)) return iiiProbeScan.get(binPath)!;");
    expect(body).toContain("iiiProbeScan?.set(binPath, version);");
    const wrapper = source.slice(source.indexOf("async function startEngine("), source.indexOf("async function scanAndStartEngine("));
    expect(wrapper).toContain("iiiProbeScan = new Map();");
    expect(wrapper).toMatch(/finally \{\s*iiiProbeScan = null;\s*\}/);
    const installer = source.slice(source.indexOf("async function runIiiInstaller"), source.indexOf("type StartupFailure"));
    expect(installer).toContain("iiiProbeScan?.delete(binPath);");
  });

  it("never opens the install prompt on Windows, where auto-install is unavailable", () => {
    const start = source.indexOf("async function startEngine");
    const body = source.slice(start, source.indexOf("async function waitForEngine", start));
    const windowsBranch = body.indexOf("} else if (IS_WINDOWS) {");
    expect(windowsBranch).toBeGreaterThan(-1);
    expect(windowsBranch).toBeLessThan(body.indexOf("p.select<Choice>("));
  });

  it("clears unready Compose state only for a PID positively identified as foreign", () => {
    const reconcileStart = source.indexOf("async function reconcilePersistedComposeEngine");
    const reconcileEnd = source.indexOf("async function main()", reconcileStart);
    const reconcileBody = source.slice(reconcileStart, reconcileEnd);
    expect(reconcileBody).toContain(
      'if (state.composePid && pidAlive(state.composePid) && composePidIdentity(state.composePid, state) !== "foreign")',
    );
  });

  it("records the launched engine version next to the worker versions in the Compose state", () => {
    const start = source.indexOf("async function startIiiBin");
    const body = source.slice(start, source.indexOf("function pickCompatibleIii", start));
    expect(body).toContain("const engineVersion = iiiBinVersion(iiiBin);");
    expect(body).toContain("...(engineVersion ? { engineVersion } : {}),");
    expect(body).toContain("workerVersions: workerBinDir ? { local: true } : COMPOSE_WORKER_VERSIONS,");
  });

  it("refuses to adopt a running Compose project whose persisted engine or workers are stale", () => {
    const reconcileStart = source.indexOf("async function reconcilePersistedComposeEngine");
    const reconcileBody = source.slice(reconcileStart, source.indexOf("async function main()", reconcileStart));
    const staleCheck = reconcileBody.indexOf("const staleRuntime = composeRuntimeVersionMismatch(state, IIPINNED_VERSION);");
    expect(staleCheck).toBeGreaterThan(-1);
    expect(staleCheck).toBeLessThan(reconcileBody.indexOf("compose::status"));
    expect(reconcileBody).toMatch(/if \(staleRuntime\) \{\s*p\.log\.error\(`The running managed Compose engine\/workers are an older version: \$\{staleRuntime\}\. Run agentmemory stop[^`]*`\);\s*process\.exit\(1\);/);
  });

  it("refuses to upgrade while a managed engine is running, before touching dependencies or the installer", () => {
    const start = source.indexOf("async function runUpgrade");
    const body = source.slice(start, source.indexOf("\nfunction pidAlive", start));
    const guard = body.indexOf("if (await managedComposeEngineRunning()) {");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf("runCommand("));
    expect(guard).toBeLessThan(body.indexOf("await runIiiInstaller()"));
    expect(body.slice(guard, body.indexOf("}", guard))).toContain("process.exit(1);");
    expect(body.slice(guard, body.indexOf("}", guard))).toContain("run agentmemory stop first");
    const helper = source.slice(source.indexOf("async function managedComposeEngineRunning"), source.indexOf("async function main()"));
    expect(helper).toContain('if (state?.kind !== "compose") return false;');
    expect(source).toContain("managedEngineRunning: managedComposeEngineRunning,");
  });
});
