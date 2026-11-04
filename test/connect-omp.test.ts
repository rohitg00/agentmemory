import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { parse } from "yaml";

vi.mock("@clack/prompts", () => ({ log: { info: vi.fn(), warn: vi.fn(), success: vi.fn() } }));

describe("OMP native connector", () => {
  let home: string;
  let bundle: string;
  let agent: string;
  const put = (path: string, value: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); };
  const install = async (options = {}) => (await import("../src/cli/connect/omp.js")).adapter.install({ dryRun: false, force: false, ...options });
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "omp-connect-"));
    agent = join(home, ".omp/agent"); bundle = join(home, "package");
    mkdirSync(agent, { recursive: true });
    for (const [name, text] of Object.entries({
      "integrations/omp/dist/index.mjs": "export default function plugin() {}\n",
      "integrations/omp/package.json": '{"name":"agentmemory-omp-extension","omp":{"extensions":["./dist/index.mjs"]}}',
      "plugin/skills/remember/SKILL.md": "# Remember\n",
      "plugin/skills/remember/REFERENCE.md": "support file\n",
      "plugin/skills/recall/SKILL.md": "# Recall\n",
      "dist/standalone.mjs": "// MCP runtime\n",
    })) put(join(bundle, name), text);
    for (const name of ["OMP_PROFILE", "PI_PROFILE", "PI_CONFIG_DIR", "PI_CODING_AGENT_DIR"]) vi.stubEnv(name, "");
    vi.stubEnv("HOME", home); vi.stubEnv("USERPROFILE", home);
    vi.resetModules();
    vi.doMock("../src/cli/connect/codex-hooks.js", () => ({ findPluginRoot: () => join(bundle, "plugin") }));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.doUnmock("../src/cli/connect/codex-hooks.js"); rmSync(home, { recursive: true, force: true }); });

  it("copies the package and full skills, preserves YAML settings and comments, and reconnects idempotently", async () => {
    const config = join(agent, "config.yml");
    put(config, "# custom\nmodel: local\nextensions: [/some/other-extension]\n");
    expect((await install()).kind).toBe("installed");
    const raw = readFileSync(config, "utf8");
    expect(raw).toContain("# custom");
    expect(parse(raw)).toEqual({ model: "local", extensions: ["/some/other-extension", join(agent, "agentmemory")] });
    expect(readFileSync(join(agent, "agentmemory/skills/remember/REFERENCE.md"), "utf8")).toBe("support file\n");
    expect((await install()).kind).toBe("already-wired");
    expect(existsSync(join(agent, "agentmemory/.mcp.json"))).toBe(false);
  });
  it("opts into the exact bundled MCP runtime without serializing credentials and retains it on reconnect", async () => {
    vi.stubEnv("AGENTMEMORY_SECRET", "fixture-do-not-write");
    await install({ withMcp: true });
    const file = join(agent, "agentmemory/.mcp.json");
    const raw = readFileSync(file, "utf8");
    expect(JSON.parse(raw).mcpServers.agentmemory).toEqual({ command: process.execPath, args: [join(bundle, "dist/standalone.mjs")], env: { AGENTMEMORY_TOOLS: "all", AGENTMEMORY_FORCE_PROXY: "1" } });
    expect(raw).not.toContain("fixture-do-not-write");
    expect((await install()).kind).toBe("already-wired");
    expect(readFileSync(file, "utf8")).toBe(raw);
  });
  it("keeps an existing user MCP server instead of installing a second one", async () => {
    const file = join(agent, "mcp.json"); const raw = '{"mcpServers":{"agentmemory":{"command":"custom"}}}'; put(file, raw);
    await install({ withMcp: true });
    expect(readFileSync(file, "utf8")).toBe(raw);
    expect(existsSync(join(agent, "agentmemory/.mcp.json"))).toBe(false);
  });
  it.each([false, true])("removes the managed MCP entry when the user takes ownership (withMcp=%s)", async withMcp => {
    await install({ withMcp: true });
    const file = join(agent, "mcp.json"); const raw = '{"mcpServers":{"agentmemory":{"command":"custom"}}}'; put(file, raw);
    expect((await install({ withMcp })).kind).toBe("installed");
    expect(readFileSync(file, "utf8")).toBe(raw);
    expect(existsSync(join(agent, "agentmemory/.mcp.json"))).toBe(false);
    expect((await install({ withMcp })).kind).toBe("already-wired");
  });
  it("backs up a customized managed MCP entry only when force permits its removal", async () => {
    await install({ withMcp: true });
    const file = join(agent, "agentmemory/.mcp.json"); const raw = '{"mcpServers":{"custom":{"command":"keep"}}}'; put(file, raw);
    put(join(agent, "mcp.json"), '{"mcpServers":{"agentmemory":{"command":"user-owned"}}}');
    expect((await install({ withMcp: true })).kind).toBe("skipped");
    expect(readFileSync(file, "utf8")).toBe(raw);
    const result = await install({ withMcp: true, force: true });
    expect(result.kind).toBe("installed");
    expect(existsSync(file)).toBe(false);
    if (result.kind === "installed") expect(readFileSync(join(result.backupPath!, ".mcp.json"), "utf8")).toBe(raw);
  });
  it.each([true, false])("preserves unmanaged MCP files and refuses only conflicts (conflicting=%s)", async conflicting => {
    const file = join(agent, "agentmemory/.mcp.json"); const raw = JSON.stringify({ mcpServers: { [conflicting ? "agentmemory" : "custom"]: { command: "custom" } } }); put(file, raw);
    put(join(agent, "mcp.json"), '{"mcpServers":{"agentmemory":{"command":"user-owned"}}}');
    expect((await install({ withMcp: true, force: true })).kind).toBe(conflicting ? "skipped" : "installed");
    expect(readFileSync(file, "utf8")).toBe(raw);
    expect(existsSync(join(agent, "config.yml"))).toBe(!conflicting);
  });
  it("uses config.yaml when present and migrates legacy JSON without dropping unrelated settings", async () => {
    put(join(agent, "config.yaml"), "model: yaml-model\n"); await install();
    expect(existsSync(join(agent, "config.yml"))).toBe(false);
    expect(parse(readFileSync(join(agent, "config.yaml"), "utf8")).model).toBe("yaml-model");
    rmSync(join(agent, "config.yaml"));
    put(join(agent, "settings.json"), '{"model":"legacy","extensions":["/custom"]}');
    await install();
    expect(parse(readFileSync(join(agent, "config.yml"), "utf8"))).toMatchObject({ model: "legacy", extensions: ["/custom", join(agent, "agentmemory")] });
  });
  it("honors named profiles, ignores the default agent override in profiles, and resolves each invocation afresh", async () => {
    vi.stubEnv("OMP_PROFILE", "work"); vi.stubEnv("PI_CODING_AGENT_DIR", join(home, "override"));
    await install();
    expect(existsSync(join(home, ".omp/profiles/work/agent/config.yml"))).toBe(true);
    expect(existsSync(join(home, "override"))).toBe(false);
    vi.stubEnv("OMP_PROFILE", ""); await install();
    expect(existsSync(join(home, "override/config.yml"))).toBe(true);
  });
  it.each(["../escape", "UPPER", "nul", "ends."])("rejects invalid profile %s without writing", async (profile) => {
    vi.stubEnv("OMP_PROFILE", profile); expect((await install()).kind).toBe("skipped");
    expect(existsSync(join(agent, "agentmemory"))).toBe(false);
  });
  it.each(["[]", "extensions: false", "extensions: [1]", "broken: [", "extensions: []\nextensions: []"])("preserves invalid YAML %s even with force", async raw => {
    put(join(agent, "config.yml"), raw); expect((await install({ force: true })).kind).toBe("skipped");
    expect(readFileSync(join(agent, "config.yml"), "utf8")).toBe(raw);
    expect(existsSync(join(agent, "agentmemory"))).toBe(false);
  });
  it("validates dry runs and refuses activation with missing bundled files", async () => {
    expect((await install({ dryRun: true })).kind).toBe("installed");
    expect(existsSync(join(agent, "config.yml"))).toBe(false);
    rmSync(join(bundle, "integrations/omp/dist/index.mjs"));
    expect((await install()).kind).toBe("skipped");
    expect(existsSync(join(agent, "agentmemory"))).toBe(false);
  });
  it("requires force for customized managed files and preserves unrelated additions", async () => {
    await install(); const file = join(agent, "agentmemory/dist/index.mjs"); put(file, "custom code");
    put(join(agent, "agentmemory/user.txt"), "keep");
    expect((await install()).kind).toBe("skipped"); expect(readFileSync(file, "utf8")).toBe("custom code");
    expect((await install({ force: true })).kind).toBe("installed");
    expect(readFileSync(join(agent, "agentmemory/user.txt"), "utf8")).toBe("keep");
  });
  it("refuses duplicate activation of a previously installed plugin", async () => {
    put(join(home, ".omp/plugins/node_modules/agentmemory-omp-extension/package.json"), '{"name":"agentmemory-omp-extension"}');
    expect((await install({ force: true })).kind).toBe("skipped");
    expect(existsSync(join(agent, "config.yml"))).toBe(false);
  });
});
