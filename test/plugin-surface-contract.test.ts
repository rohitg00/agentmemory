import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vitestConfig from "../vitest.config.ts";
import { getAllTools } from "../src/mcp/tools-registry.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = join(repoRoot, "plugin");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function countSkillDirs(): number {
  return readdirSync(join(pluginRoot, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .length;
}

function parseCount(description: string, label: "hooks" | "MCP tools" | "skills"): number {
  let match: RegExpExecArray | null = null;
  switch (label) {
    case "MCP tools":
      match = /(\d+)\s+MCP\s+tools/.exec(description);
      break;
    case "hooks":
      match = /(\d+)\s+hooks/.exec(description);
      break;
    case "skills":
      match = /(\d+)\s+skills/.exec(description);
      break;
  }
  expect(match, `description should state "${label}" count: ${description}`).not.toBeNull();
  return Number(match![1]);
}

function hookEventCount(path: string): number {
  const manifest = readJson<{ hooks: Record<string, unknown> }>(path);
  return Object.keys(manifest.hooks).length;
}

describe("Scoped coverage contract", () => {
  it("counts skills, plugin, and integration source surfaces in coverage", () => {
    const include = vitestConfig.test?.coverage?.include ?? [];
    expect(include).toEqual(
      expect.arrayContaining([
        "src/**/*.ts",
        "scripts/skills/**/*.ts",
        "integrations/pi/security.ts",
        "integrations/openclaw/plugin.mjs",
      ]),
    );
  });
});

describe("Plugin manifest surface counts", () => {
  it("keeps plugin descriptions aligned with tool, skill, and hook counts", () => {
    const toolCount = getAllTools().length;
    const skillCount = countSkillDirs();
    const manifests = [
      {
        path: join(pluginRoot, "plugin.json"),
        hookManifest: join(pluginRoot, "hooks/hooks.copilot.json"),
      },
      {
        path: join(pluginRoot, ".codex-plugin/plugin.json"),
        hookManifest: join(pluginRoot, "hooks/hooks.codex.json"),
      },
      {
        path: join(pluginRoot, ".claude-plugin/plugin.json"),
        hookManifest: undefined,
      },
    ];

    for (const entry of manifests) {
      const manifest = readJson<{ description: string }>(entry.path);
      expect(parseCount(manifest.description, "MCP tools")).toBe(toolCount);
      expect(parseCount(manifest.description, "skills")).toBe(skillCount);
      if (entry.hookManifest) {
        expect(parseCount(manifest.description, "hooks")).toBe(
          hookEventCount(entry.hookManifest),
        );
      }
    }
  });

  it("keeps integration README MCP tool badges aligned with the registry", () => {
    const toolCount = getAllTools().length;
    for (const rel of [
      "integrations/hermes/README.md",
      "integrations/openclaw/README.md",
      "plugin/opencode/README.md",
    ]) {
      const text = readFileSync(join(repoRoot, rel), "utf8");
      expect(text, rel).toContain(`MCP-${toolCount}_tools`);
      expect(text, rel).toContain(`alt="${toolCount} MCP tools"`);
      for (const match of text.matchAll(/(\d+)\s+(?:MCP|memory)\s+tools/g)) {
        expect(Number(match[1]), `${rel} has stale count in "${match[0]}"`).toBe(
          toolCount,
        );
      }
    }
  });
});

describe("Package and integration manifests", () => {
  it("ships the MCP package as a thin executable wrapper with publish provenance", () => {
    const pkg = readJson<{
      name: string;
      type: string;
      bin: Record<string, string>;
      files: string[];
      dependencies: Record<string, string>;
      publishConfig: { access: string; provenance: boolean };
    }>(join(repoRoot, "packages/mcp/package.json"));

    expect(pkg.name).toBe("@agentmemory/mcp");
    expect(pkg.type).toBe("module");
    expect(pkg.bin["agentmemory-mcp"]).toBe("./bin.mjs");
    expect(pkg.files).toEqual(expect.arrayContaining(["bin.mjs", "README.md", "LICENSE"]));
    expect(pkg.dependencies["@agentmemory/agentmemory"]).toBe("workspace:~");
    expect(pkg.publishConfig).toMatchObject({ access: "public", provenance: true });
    expect(existsSync(join(repoRoot, "packages/mcp", pkg.bin["agentmemory-mcp"]))).toBe(true);
  });

  it("keeps OpenClaw package and plugin manifests pointing at the shipped module", () => {
    const pkg = readJson<{
      name: string;
      type: string;
      openclaw: { extensions: string[] };
    }>(join(repoRoot, "integrations/openclaw/package.json"));
    const manifest = readJson<{
      id: string;
      kind: string;
      name: string;
      configSchema: Record<string, unknown>;
    }>(
      join(repoRoot, "integrations/openclaw/openclaw.plugin.json"),
    );

    expect(pkg.name).toBe("agentmemory");
    expect(pkg.type).toBe("module");
    expect(pkg.openclaw.extensions).toContain("./plugin.mjs");
    expect(manifest).toMatchObject({
      id: "agentmemory",
      kind: "memory",
      name: "agentmemory",
    });
    expect(manifest.configSchema).toBeDefined();
    expect(existsSync(join(repoRoot, "integrations/openclaw/plugin.mjs"))).toBe(true);
  });

  it("keeps pi integration packaging private and ESM-only", () => {
    const pkg = readJson<{ name: string; private: boolean; type: string }>(
      join(repoRoot, "integrations/pi/package.json"),
    );
    expect(pkg).toMatchObject({
      name: "agentmemory-pi-extension",
      private: true,
      type: "module",
    });
    expect(existsSync(join(repoRoot, "integrations/pi/index.ts"))).toBe(true);
    expect(existsSync(join(repoRoot, "integrations/pi/security.ts"))).toBe(true);
  });
});

describe("Generated skill references", () => {
  it("contains generated blocks for every source-derived reference", () => {
    const references = [
      ["agentmemory-mcp-tools/REFERENCE.md", "tools"],
      ["agentmemory-rest-api/REFERENCE.md", "rest"],
      ["agentmemory-config/REFERENCE.md", "env"],
      ["agentmemory-agents/REFERENCE.md", "agents"],
      ["agentmemory-hooks/REFERENCE.md", "hooks"],
    ] as const;

    for (const [rel, key] of references) {
      const text = readFileSync(join(pluginRoot, "skills", rel), "utf8");
      expect(text).toContain(`<!-- AUTOGEN:${key} START`);
      expect(text).toContain(`<!-- AUTOGEN:${key} END -->`);
    }
  });

  it("runs the skill reference generator and skill lint success paths in-process", async () => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    try {
      process.exitCode = undefined;
      process.argv = [process.execPath, join(repoRoot, "scripts/skills/generate.ts"), "--check"];
      await import("../scripts/skills/generate.ts");
      expect(process.exitCode).toBeUndefined();

      process.argv = [process.execPath, join(repoRoot, "scripts/skills/check.ts")];
      await import("../scripts/skills/check.ts");
      expect(process.exitCode).toBeUndefined();
    } finally {
      process.argv = originalArgv;
      process.exitCode = originalExitCode;
    }
  });
});
