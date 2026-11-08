import { createHash } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { chmodSync, statSync, cpSync, mkdtempSync, mkdirSync, rmSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const options = { dryRun: false, force: false };
describe("connect: pi", () => {
  let home: string;
  const dir = () => join(home, ".pi/agent");
  const target = () => join(dir(), "agentmemory");
  const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "am-pi-")); vi.resetModules();
    vi.stubEnv("HOME", home); vi.stubEnv("USERPROFILE", home); vi.stubEnv("PI_CODING_AGENT_DIR", "");
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true }); });
  it("detects the default and custom agent directory", async () => {
    const { adapter } = await import("../src/cli/connect/pi.js"); expect(adapter.detect()).toBe(false);
    mkdirSync(dir(), { recursive: true }); expect(adapter.detect()).toBe(true);
    vi.stubEnv("PI_CODING_AGENT_DIR", "~/custom-pi"); mkdirSync(join(home, "custom-pi"));
    expect(adapter.detect()).toBe(true); expect((await adapter.install(options)).kind).toBe("installed");
    expect(json(join(home, "custom-pi/settings.json")).packages).toContain(join(home, "custom-pi/agentmemory"));
  });
  it("installs the compiled package and all skills, preserves settings and is idempotent", async () => {
    mkdirSync(dir(), { recursive: true }); writeFileSync(join(dir(), "settings.json"), JSON.stringify({ theme: "light", packages: ["npm:another-package"] }));
    const { adapter } = await import("../src/cli/connect/pi.js"); expect((await adapter.install(options)).kind).toBe("installed");
    expect(json(join(dir(), "settings.json"))).toEqual({ theme: "light", packages: ["npm:another-package", target()] });
    expect(readFileSync(join(target(), "dist/index.mjs"), "utf8")).toBe(readFileSync("integrations/pi/dist/index.mjs", "utf8"));
    expect(readdirSync(join(target(), "skills")).filter(name => existsSync(join(target(), "skills", name, "SKILL.md")))).toHaveLength(17);
    expect((await adapter.install(options)).kind).toBe("already-wired");
  });
  it("preserves customized files unless forced, then backs them up", async () => {
    const { adapter } = await import("../src/cli/connect/pi.js"); await adapter.install(options);
    writeFileSync(join(target(), "dist/index.mjs"), "// custom\n");
    expect((await adapter.install(options)).kind).toBe("skipped");
    expect(readFileSync(join(target(), "dist/index.mjs"), "utf8")).toBe("// custom\n");
    const result = await adapter.install({ ...options, force: true }); expect(result.kind).toBe("installed");
    expect(readdirSync(join(home, ".agentmemory/backups")).some(file => file.startsWith("pi-extension-"))).toBe(true);
  });
  it("leaves the old copied extension intact and refuses duplicate capture", async () => {
    const legacy = join(dir(), "extensions/agentmemory"); mkdirSync(legacy, { recursive: true }); writeFileSync(join(legacy, "index.ts"), "// custom");
    const { adapter } = await import("../src/cli/connect/pi.js"); expect((await adapter.install({ ...options, force: true })).kind).toBe("skipped");
    expect(readFileSync(join(legacy, "index.ts"), "utf8")).toBe("// custom"); expect(existsSync(target())).toBe(false);
  });
  it.each(["npm:@agentmemory/pi", { source: "npm:@agentmemory/pi@0.1.0", skills: [] }])("uses an existing package and can add MCP without installing a duplicate", async source => {
    mkdirSync(dir(), { recursive: true }); const text = JSON.stringify({ packages: [source] }); writeFileSync(join(dir(), "settings.json"), text);
    const { adapter } = await import("../src/cli/connect/pi.js"); expect((await adapter.install({ ...options, withMcp: true })).kind).toBe("installed");
    expect(existsSync(target())).toBe(false); expect(readFileSync(join(dir(), "settings.json"), "utf8")).toBe(text);
    expect(json(join(dir(), "mcp.json")).mcpServers.agentmemory.env.AGENTMEMORY_FORCE_PROXY).toBe("1");
  });
  it("refreshes only an unchanged connector-owned MCP entry after an upgrade", async () => {
    const { adapter } = await import("../src/cli/connect/pi.js"); await adapter.install({ ...options, withMcp: true });
    const path = join(dir(), "mcp.json"); const old = json(path);
    old.mcpServers.agentmemory.args = ["/previous-version/dist/standalone.mjs"];
    old._agentmemoryConnector.entryHash = createHash("sha256").update(JSON.stringify(old.mcpServers.agentmemory)).digest("hex");
    writeFileSync(path, JSON.stringify(old));
    await adapter.install({ ...options, withMcp: true });
    expect(json(path).mcpServers.agentmemory.args[0]).not.toContain("previous-version");
    const custom = json(path); custom.mcpServers.agentmemory.env.CUSTOM = "preserve"; writeFileSync(path, JSON.stringify(custom));
    await adapter.install({ ...options, withMcp: true, force: true }); expect(json(path)).toEqual(custom);
  });
  it("keeps both original configs when backups share the same timestamp", async () => {
    mkdirSync(dir(), { recursive: true });
    const settings = JSON.stringify({ theme: "light" });
    const mcp = JSON.stringify({ mcpServers: { other: { command: "other-server" } } });
    writeFileSync(join(dir(), "settings.json"), settings); writeFileSync(join(dir(), "mcp.json"), mcp);
    vi.spyOn(Date.prototype, "toISOString").mockReturnValue("2026-10-25T00:00:00.000Z");
    const { adapter } = await import("../src/cli/connect/pi.js"); expect((await adapter.install({ ...options, withMcp: true })).kind).toBe("installed");
    const backups = join(home, ".agentmemory/backups");
    const originals = readdirSync(backups).filter(name => name.endsWith(".config")).map(name => readFileSync(join(backups, name), "utf8"));
    expect(originals).toHaveLength(2); expect(originals).toContain(settings); expect(originals).toContain(mcp);
  });
  it.skipIf(process.platform === "win32")("preserves private permissions when adding MCP beside other credentials", async () => {
    mkdirSync(dir(), { recursive: true }); const path = join(dir(), "mcp.json");
    const other = { url: "https://other.example", headers: { Authorization: "Bearer fixture-only" } };
    writeFileSync(path, JSON.stringify({ mcpServers: { other } })); chmodSync(path, 0o600);
    const { adapter } = await import("../src/cli/connect/pi.js"); expect((await adapter.install({ ...options, withMcp: true })).kind).toBe("installed");
    expect(statSync(path).mode & 0o777).toBe(0o600); expect(json(path).mcpServers.other).toEqual(other);
  });
  it("preserves user-owned MCP settings even with force", async () => {
    mkdirSync(dir(), { recursive: true }); const mcp = { mcpServers: { other: { command: "other" }, agentmemory: { url: "https://custom.example/mcp" } } };
    writeFileSync(join(dir(), "mcp.json"), JSON.stringify(mcp));
    const { adapter } = await import("../src/cli/connect/pi.js"); await adapter.install({ ...options, force: true, withMcp: true });
    expect(json(join(dir(), "mcp.json"))).toEqual(mcp);
  });
  it.each([['settings.json', '{broken'], ['settings.json', '{"packages":{}}'], ['mcp.json', '{"mcpServers":[]}']])("rejects invalid %s before installing files", async (file, content) => {
    mkdirSync(dir(), { recursive: true }); writeFileSync(join(dir(), file), content);
    const { adapter } = await import("../src/cli/connect/pi.js"); expect((await adapter.install({ ...options, withMcp: true })).kind).toBe("skipped");
    expect(readFileSync(join(dir(), file), "utf8")).toBe(content); expect(existsSync(target())).toBe(false);
  });
  it("installs a global MCP definition without modifying a project override", async () => {
    const project = join(home, "project"); mkdirSync(join(project, ".pi"), { recursive: true });
    const override = JSON.stringify({ mcpServers: { agentmemory: { enabled: false } } });
    writeFileSync(join(project, ".pi/mcp.json"), override); vi.spyOn(process, "cwd").mockReturnValue(project);
    const { adapter } = await import("../src/cli/connect/pi.js"); expect((await adapter.install({ ...options, withMcp: true })).kind).toBe("installed");
    expect(json(join(dir(), "mcp.json")).mcpServers.agentmemory.command).toBe(process.execPath);
    expect(readFileSync(join(project, ".pi/mcp.json"), "utf8")).toBe(override);
  });
  it("does not mistake a possibly untrusted project package for a global installation", async () => {
    const project = join(home, "project"); mkdirSync(join(project, ".pi"), { recursive: true });
    writeFileSync(join(project, ".pi/settings.json"), JSON.stringify({ packages: ["npm:@agentmemory/pi"] }));
    vi.spyOn(process, "cwd").mockReturnValue(project);
    const { adapter } = await import("../src/cli/connect/pi.js"); expect((await adapter.install(options)).kind).toBe("skipped"); expect(existsSync(target())).toBe(false);
  });
  it("rejects an explicit extension entry that would load the package twice", async () => {
    const copy = join(home, "old-package"); mkdirSync(copy); mkdirSync(dir(), { recursive: true });
    writeFileSync(join(copy, "package.json"), JSON.stringify({ name: "@agentmemory/pi" }));
    writeFileSync(join(dir(), "settings.json"), JSON.stringify({ extensions: [join(copy, "index.ts")] }));
    const { adapter } = await import("../src/cli/connect/pi.js"); expect((await adapter.install(options)).kind).toBe("skipped"); expect(existsSync(target())).toBe(false);
  });
  it("dry-run leaves configuration and package files untouched", async () => {
    const { adapter } = await import("../src/cli/connect/pi.js"); expect((await adapter.install({ ...options, dryRun: true, withMcp: true })).kind).toBe("installed");
    expect(existsSync(dir())).toBe(false);
  });
});

describe("Pi package archive", () => {
  it("ships a self-contained compiled extension, skills, metadata and license", () => {
    const dir = mkdtempSync(join(tmpdir(), "am-pi-pack-"));
    try {
      rmSync("integrations/pi/skills", { recursive: true, force: true });
      for (const name of readdirSync("plugin/skills")) if (existsSync(join("plugin/skills", name, "SKILL.md"))) cpSync(join("plugin/skills", name), join("integrations/pi/skills", name), { recursive: true });
      const npmCli = process.env.npm_execpath;
      const output = execFileSync(npmCli ? process.execPath : "npm", [...(npmCli ? [npmCli] : []), "pack", "./integrations/pi", "--ignore-scripts", "--offline", "--json", "--pack-destination", dir], { encoding: "utf8", env: { ...process.env, npm_config_cache: join(dir, "cache") } });
      const [packed] = JSON.parse(output); execFileSync("tar", ["-xzf", join(dir, packed.filename), "-C", dir]);
      const root = join(dir, "package"); const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
      expect(packed.name).toBe("@agentmemory/pi"); expect(pkg.publishConfig.access).toBe("public"); expect(pkg.keywords).toContain("pi-package");
      expect(pkg.pi).toEqual({ extensions: ["./dist/index.mjs"], skills: ["./skills"] });
      expect(pkg.peerDependencies).toEqual({ "@earendil-works/pi-coding-agent": "*", typebox: "*" });
      expect(pkg.dependencies).toBeUndefined(); expect(readdirSync(root).sort()).toEqual(["LICENSE", "README.md", "dist", "package.json", "skills"]);
      expect(readdirSync(join(root, "skills"))).toHaveLength(17);
      expect(readFileSync(join(root, "dist/index.mjs"), "utf8")).not.toMatch(/from ["']\.\.\//);
      expect(readFileSync(join(root, "LICENSE"), "utf8")).toBe(readFileSync("LICENSE", "utf8"));
      expect(JSON.parse(readFileSync("package.json", "utf8")).files).toContain("integrations/pi/");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
