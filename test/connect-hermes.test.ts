import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { parse } from "yaml";

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), success: vi.fn() }));
vi.mock("@clack/prompts", () => ({ log }));

describe("Hermes native connector", () => {
  let home: string;
  let profile: string;
  let bundle: string;
  let config: string;
  const put = (path: string, value: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); };
  const install = async (options = {}) => (await import("../src/cli/connect/hermes.js")).adapter.install({ dryRun: false, force: false, ...options });
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "hermes-connect-"));
    profile = join(home, "profiles", "work");
    bundle = join(home, "package");
    config = join(profile, "config.yaml");
    mkdirSync(profile, { recursive: true });
    for (const [name, text] of Object.entries({
      "integrations/hermes/__init__.py": "# provider version one\n",
      "integrations/hermes/plugin.yaml": "name: agentmemory\n",
      "plugin/skills/remember/SKILL.md": "# Remember\n",
      "plugin/skills/remember/REFERENCE.md": "Local support file\n",
      "plugin/skills/recall/SKILL.md": "# Recall\n",
      "dist/standalone.mjs": "// packaged MCP\n",
    })) put(join(bundle, name), text);
    vi.stubEnv("HOME", home); vi.stubEnv("USERPROFILE", home); vi.stubEnv("HERMES_HOME", profile);
    vi.resetModules();
    vi.doMock("../src/cli/connect/codex-hooks.js", () => ({ findPluginRoot: () => join(bundle, "plugin") }));
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllEnvs(); vi.doUnmock("../src/cli/connect/codex-hooks.js");
    rmSync(home, { recursive: true, force: true });
  });
  it("installs native files and complete skills before activating the selected profile, with no secret serialization", async () => {
    vi.stubEnv("AGENTMEMORY_SECRET", "do-not-write-or-print-this");
    put(config, "# Keep this comment\nmodel: custom\nmemory:\n  budget: 400\nplugins:\n  enabled: [other]\n");
    const result = await install();
    expect(result.kind).toBe("installed");
    const raw = readFileSync(config, "utf8");
    expect(raw).toContain("# Keep this comment");
    expect(parse(raw)).toEqual({ model: "custom", memory: { budget: 400, provider: "agentmemory" }, plugins: { enabled: ["other", "agentmemory"] } });
    expect(existsSync(join(profile, "plugins/agentmemory/__init__.py"))).toBe(true);
    expect(readFileSync(join(profile, "skills/agentmemory/remember/REFERENCE.md"), "utf8")).toBe("Local support file\n");
    expect(existsSync(join(home, ".hermes"))).toBe(false);
    expect(raw).not.toContain("do-not-write-or-print-this");
    expect(JSON.stringify(log.info.mock.calls)).not.toContain("do-not-write-or-print-this");
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining("Authentication is not verified"));
    expect((await install()).kind).toBe("already-wired");
    expect(readFileSync(config, "utf8")).toBe(raw);
  });
  it("resolves HERMES_HOME afresh when switching profiles without reloading the module", async () => {
    await install();
    const alternate = join(home, "personal");
    mkdirSync(alternate); vi.stubEnv("HERMES_HOME", alternate);
    expect((await install()).kind).toBe("installed");
    expect(existsSync(join(alternate, "plugins/agentmemory/__init__.py"))).toBe(true);
    expect(parse(readFileSync(join(alternate, "config.yaml"), "utf8")).memory.provider).toBe("agentmemory");
  });
  it("expands the same home and environment path syntax as Hermes", async () => {
    vi.stubEnv("HERMES_HOME", "~/${PROFILE_NAME}"); vi.stubEnv("PROFILE_NAME", "personal");
    expect((await install()).kind).toBe("installed");
    expect(existsSync(join(home, "personal/plugins/agentmemory/__init__.py"))).toBe(true);
    vi.stubEnv("HERMES_HOME", ""); vi.stubEnv("HERMES_DATA_DIR_SUFFIX", "-test");
    expect((await install()).kind).toBe("installed");
    expect(existsSync(join(home, ".hermes-test/plugins/agentmemory/__init__.py"))).toBe(true);
  });
  it.each(["null", "[one, two]", "memory: []", "plugins: []", "plugins:\n  enabled: false", "memory:\n  provider: 2", "broken: [", "memory: {}\nmemory: {}"])("preserves malformed YAML %s", async (raw) => {
    put(config, raw);
    expect((await install({ force: true })).kind).toBe("skipped");
    expect(readFileSync(config, "utf8")).toBe(raw);
    expect(existsSync(join(profile, "plugins"))).toBe(false);
  });
  it("does not silently replace another provider or undo a disabled plugin", async () => {
    put(config, "memory:\n  provider: custom\nplugins:\n  disabled: [agentmemory, unrelated]\n");
    expect((await install()).kind).toBe("skipped");
    expect(existsSync(join(profile, "plugins"))).toBe(false);
    const result = await install({ force: true });
    expect(result.kind).toBe("installed");
    expect(parse(readFileSync(config, "utf8")).plugins.disabled).toEqual(["unrelated"]);
    expect(result.kind === "installed" && result.backupPath && readFileSync(result.backupPath, "utf8")).toContain("provider: custom");
  });
  it("dry-run validates availability without copying files, config, or backups", async () => {
    expect((await install({ dryRun: true })).kind).toBe("installed");
    expect(existsSync(config)).toBe(false);
    expect(existsSync(join(profile, "plugins"))).toBe(false);
    expect(existsSync(join(home, ".agentmemory"))).toBe(false);
  });
  it("does not activate the provider when the packaged implementation or required skill is absent", async () => {
    rmSync(join(bundle, "plugin/skills/recall/SKILL.md"));
    expect((await install()).kind).toBe("skipped");
    expect(existsSync(config)).toBe(false);
    expect(existsSync(join(profile, "plugins"))).toBe(false);
  });
  it("upgrades managed files, preserves user additions, and requires force for edited managed files", async () => {
    await install();
    const target = join(profile, "plugins/agentmemory");
    put(join(target, "custom.txt"), "keep me");
    put(join(bundle, "integrations/hermes/__init__.py"), "# provider version two\n");
    expect((await install()).kind).toBe("installed");
    expect(readFileSync(join(target, "__init__.py"), "utf8")).toContain("version two");
    expect(readFileSync(join(target, "custom.txt"), "utf8")).toBe("keep me");
    put(join(target, "__init__.py"), "# user customization\n");
    expect((await install()).kind).toBe("skipped");
    expect(readFileSync(join(target, "__init__.py"), "utf8")).toContain("user customization");
    expect((await install({ force: true })).kind).toBe("installed");
  });
  it("creates private configuration and preserves its existing permissions on upgrades", async () => {
    await install();
    if (process.platform !== "win32") expect(statSync(config).mode & 0o777).toBe(0o600);
    put(config, readFileSync(config, "utf8") + "custom: true\n");
    await install({ withMcp: true });
    if (process.platform !== "win32") expect(statSync(config).mode & 0o777).toBe(0o600);
  });
  it("uses the exact installed runtime only for explicit MCP opt-in and preserves custom MCP entries", async () => {
    await install();
    expect(parse(readFileSync(config, "utf8")).mcp_servers).toBeUndefined();
    expect((await install({ withMcp: true })).kind).toBe("installed");
    const entry = parse(readFileSync(config, "utf8")).mcp_servers.agentmemory;
    expect(entry.command).toBe(process.execPath);
    expect(entry.args).toEqual([join(bundle, "dist/standalone.mjs")]);
    expect(entry.env).toMatchObject({ AGENTMEMORY_SECRET: "${AGENTMEMORY_SECRET}", AGENTMEMORY_CREDENTIAL_MODE: "explicit", AGENTMEMORY_FORCE_PROXY: "1" });
    put(config, "memory:\n  provider: agentmemory\nmcp_servers:\n  agentmemory:\n    command: custom\n");
    await install({ withMcp: true });
    expect(parse(readFileSync(config, "utf8")).mcp_servers.agentmemory).toEqual({ command: "custom" });
  });
});
