import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import tsdownConfig from "../tsdown.config.js";

const repoRoot = resolve(__dirname, "..");
const pluginRoot = join(repoRoot, "plugin");

type PackageJson = {
  bin?: Record<string, string>;
  exports?: Record<string, string | { import?: string; types?: string }>;
  files?: string[];
  scripts?: Record<string, string>;
};

type TsdownEntry = {
  entry?: string[];
  outDir?: string;
  clean?: boolean;
  dts?: boolean;
  sourcemap?: boolean;
  banner?: { js?: string };
};

type HookHandler = { command: string };
type HookEntry = { hooks: HookHandler[] };

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function packageJson(): PackageJson {
  return readJson<PackageJson>(join(repoRoot, "package.json"));
}

function tsdownEntries(): TsdownEntry[] {
  return Array.isArray(tsdownConfig) ? (tsdownConfig as TsdownEntry[]) : [tsdownConfig as TsdownEntry];
}

function manifestScriptRefs(manifest: string): string[] {
  const hooks = readJson<{ hooks: Record<string, Array<HookEntry | HookHandler>> }>(
    join(pluginRoot, "hooks", manifest),
  );
  const refs = new Set<string>();
  for (const entries of Object.values(hooks.hooks)) {
    for (const entry of entries) {
      const handlers = "hooks" in entry ? entry.hooks : [entry];
      for (const handler of handlers) {
        const match = handler.command.match(/\$\{(?:CLAUDE_PLUGIN_ROOT|COPILOT_PLUGIN_ROOT)\}\/(scripts\/[^\s"]+\.mjs)/);
        if (match) refs.add(match[1]!);
      }
    }
  }
  return [...refs].sort();
}

describe("build and package output contract", () => {
  it("package entrypoints are backed by tsdown build entries", () => {
    const pkg = packageJson();
    const entries = tsdownEntries();
    const entrySources = new Set(entries.flatMap((entry) => entry.entry ?? []));

    expect(pkg.bin?.agentmemory).toBe("dist/cli.mjs");
    expect(entrySources.has("src/cli.ts")).toBe(true);
    expect(pkg.exports?.["."]).toMatchObject({
      import: "./dist/index.mjs",
      types: "./dist/index.d.mts",
    });
    expect(entrySources.has("src/index.ts")).toBe(true);
    expect(pkg.exports?.["./dist/standalone.mjs"]).toBe("./dist/standalone.mjs");
    expect(entrySources.has("src/mcp/standalone.ts")).toBe(true);

    const indexEntry = entries.find((entry) => entry.entry?.includes("src/index.ts"));
    expect(indexEntry).toMatchObject({
      outDir: "dist",
      clean: true,
      dts: true,
      sourcemap: true,
      banner: { js: "#!/usr/bin/env node" },
    });
  });

  it("runtime assets copied by the build are included in the npm package files allowlist", () => {
    const pkg = packageJson();
    const files = new Set(pkg.files ?? []);
    const buildScript = pkg.scripts?.build ?? "";

    for (const asset of [
      "iii-config.yaml",
      "iii-config.docker.yaml",
      "docker-compose.yml",
      ".env.example",
    ]) {
      expect(files.has(asset), `${asset} should be included in package files`).toBe(true);
      expect(buildScript, `${asset} should be copied into dist by npm run build`).toContain(
        `cp ${asset} dist/`,
      );
    }

    expect(files.has("dist/")).toBe(true);
    expect(files.has("plugin/")).toBe(true);
    expect(buildScript).toContain("mkdir -p dist/viewer");
    expect(buildScript).toContain("cp src/viewer/index.html dist/viewer/");
    expect(buildScript).toContain("cp src/viewer/favicon.svg dist/viewer/");
  });

  it("hook scripts referenced by plugin manifests are generated into dist/hooks and plugin/scripts", () => {
    const entries = tsdownEntries();
    const byOutDir = new Map<string, Set<string>>();
    for (const entry of entries) {
      const outDir = entry.outDir ?? "";
      const set = byOutDir.get(outDir) ?? new Set<string>();
      for (const source of entry.entry ?? []) set.add(source);
      byOutDir.set(outDir, set);
    }

    const scriptRefs = new Set([
      ...manifestScriptRefs("hooks.json"),
      ...manifestScriptRefs("hooks.codex.json"),
      ...manifestScriptRefs("hooks.copilot.json"),
    ]);

    expect(scriptRefs.size).toBeGreaterThanOrEqual(12);
    for (const scriptRef of scriptRefs) {
      const source = `src/hooks/${basename(scriptRef, ".mjs")}.ts`;
      expect(existsSync(join(repoRoot, source)), `${source} should exist`).toBe(true);
      expect(byOutDir.get("dist/hooks")?.has(source), `${source} should build into dist/hooks`).toBe(
        true,
      );
      expect(
        byOutDir.get("plugin/scripts")?.has(source),
        `${source} should build into plugin/scripts`,
      ).toBe(true);
    }
  });

  it("referenced plugin hook scripts are present and executable in the packaged plugin output", () => {
    const scriptRefs = new Set([
      ...manifestScriptRefs("hooks.json"),
      ...manifestScriptRefs("hooks.codex.json"),
      ...manifestScriptRefs("hooks.copilot.json"),
    ]);

    for (const scriptRef of scriptRefs) {
      const scriptPath = join(pluginRoot, scriptRef);
      expect(existsSync(scriptPath), `${scriptRef} should exist`).toBe(true);
      expect(statSync(scriptPath).mode & 0o111, `${scriptRef} should be executable`).toBeGreaterThan(
        0,
      );
    }
  });

  it("does not ship orphaned hook script outputs without a source hook", () => {
    const sourceHooks = new Set(
      readdirSync(join(repoRoot, "src/hooks"))
        .filter((name) => !name.startsWith("_") && name.endsWith(".ts"))
        .map((name) => `scripts/${basename(name, ".ts")}.mjs`),
    );

    const manifestRefs = new Set([
      ...manifestScriptRefs("hooks.json"),
      ...manifestScriptRefs("hooks.codex.json"),
      ...manifestScriptRefs("hooks.copilot.json"),
    ]);

    for (const ref of manifestRefs) {
      expect(sourceHooks.has(ref), `${ref} should have a src/hooks source`).toBe(true);
    }
  });
});
