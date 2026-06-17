import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import cliHooksConfig from "../vitest.cli-hooks.config";
import eslintConfig from "../eslint.config.js";
import vitestConfig from "../vitest.config";

type PackageJson = {
  packageManager?: string;
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  bundledDependencies?: string[];
  bundleDependencies?: string[];
};

type CoverageConfig = {
  provider?: string;
  all?: boolean;
  include?: string[];
  exclude?: string[];
  reportsDirectory?: string;
  reporter?: string[];
  thresholds?: Record<string, number>;
};

type RootVitestConfig = {
  test?: {
    testTimeout?: number;
    coverage?: CoverageConfig;
  };
};

type FlatConfig = {
  files?: string[];
  ignores?: string[];
  languageOptions?: {
    globals?: Record<string, unknown>;
  };
  rules?: Record<string, unknown>;
};

function readText(path: string): string {
  return readFileSync(path, "utf-8");
}

function readPackageJson(): PackageJson {
  return JSON.parse(readText("package.json")) as PackageJson;
}

function flatConfigs(): FlatConfig[] {
  return eslintConfig as FlatConfig[];
}

function findConfigWithRule(ruleName: string): FlatConfig | undefined {
  return flatConfigs().find((config) =>
    Object.prototype.hasOwnProperty.call(config.rules ?? {}, ruleName),
  );
}

function ciRunCount(command: string): number {
  return readText(".github/workflows/ci.yml").split(`run: ${command}`).length - 1;
}

function workflowTriggerBlock(workflow: string, trigger: string): string {
  const lines = workflow.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${trigger}:`);
  expect(start, `missing workflow trigger: ${trigger}`).toBeGreaterThanOrEqual(0);

  const end = lines.findIndex(
    (line, index) => index > start && /^  [A-Za-z0-9_-]+:/.test(line),
  );
  return lines.slice(start, end === -1 ? lines.length : end).join("\n");
}

function indexOfStep(workflow: string, step: string): number {
  const index = workflow.indexOf(step);
  expect(index, `missing workflow step: ${step}`).toBeGreaterThanOrEqual(0);
  return index;
}

function expectTopLevelYamlScalar(yaml: string, key: string, value: string): void {
  expect(yaml.split(/\r?\n/)).toContain(`${key}: ${value}`);
}

describe("root quality gates", () => {
  it("exposes lint and coverage scripts in package.json", () => {
    const pkg = readPackageJson();

    expect(pkg.scripts?.lint).toBe(
      'eslint eslint.config.js vitest.config.ts "src/**/*.{ts,tsx,js,mjs}" "test/**/*.ts" "scripts/**/*.ts" "benchmark/**/*.ts" "eval/**/*.ts" "integrations/pi/**/*.ts"',
    );
    expect(pkg.scripts?.coverage).toBe(
      "vitest run --coverage --exclude test/integration.test.ts",
    );
    expect(pkg.scripts?.test).toBe(
      "vitest run --exclude test/integration.test.ts",
    );
    expect(pkg.scripts?.["coverage:cli-hooks"]).toBe(
      "vitest run --coverage --config vitest.cli-hooks.config.ts",
    );
  });

  it("pins the root lint and coverage dev tools", () => {
    const deps = readPackageJson().devDependencies ?? {};

    expect(deps.eslint).toBe("10.5.0");
    expect(deps["@eslint/js"]).toBe("10.0.1");
    expect(deps["typescript-eslint"]).toBe("8.61.0");
    expect(deps.globals).toBe("17.6.0");
    expect(deps.vitest).toBe("4.1.8");
    expect(deps["@vitest/coverage-v8"]).toBe("4.1.8");
  });

  it("has root ESLint and Vitest coverage configuration files", () => {
    expect(existsSync("eslint.config.js")).toBe(true);
    expect(existsSync("vitest.config.ts")).toBe(true);
  });

  it("runs required CI checks for every pull request", () => {
    const pullRequest = workflowTriggerBlock(readText(".github/workflows/ci.yml"), "pull_request");

    expect(pullRequest).toContain("types: [opened, synchronize, reopened, ready_for_review]");
    expect(pullRequest).toContain("branches: [main]");
    expect(pullRequest).not.toContain("paths-ignore:");
  });

  it("keeps generated and runtime paths out of root linting", () => {
    const ignoredPaths = flatConfigs().flatMap((config) => config.ignores ?? []);

    expect(ignoredPaths).toEqual(
      expect.arrayContaining([
        "node_modules/**",
        "dist/**",
        "coverage/**",
        "data/**",
        "data-*/**",
        "eval/reports/**",
        "eval/data/longmemeval/**",
        "plugin/scripts/**/*.map",
        "plugin/scripts/**/*.d.mts",
        "website/**",
      ]),
    );
  });

  it("keeps the lint gate calibrated for the current legacy baseline", () => {
    const baselineRules = findConfigWithRule("no-console")?.rules ?? {};

    expect(baselineRules).toMatchObject({
      "no-console": "off",
      "no-control-regex": "off",
      "no-empty": "off",
      "no-regex-spaces": "off",
      "no-unused-vars": "off",
      "no-useless-assignment": "off",
      "no-useless-escape": "off",
      "preserve-caught-error": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-unused-vars": "off",
    });
  });

  it("provides Vitest globals only to test files during linting", () => {
    const testConfig = flatConfigs().find((config) =>
      config.files?.includes("test/**/*.ts"),
    );

    expect(testConfig?.languageOptions?.globals).toMatchObject({
      describe: false,
      expect: false,
      it: false,
      vi: false,
    });
  });

  it("enforces root coverage thresholds and reports", () => {
    const testConfig = (vitestConfig as RootVitestConfig).test;
    const coverage = testConfig?.coverage;

    expect(testConfig?.testTimeout).toBe(30_000);
    expect(coverage?.provider).toBe("v8");
    expect(coverage?.all).toBe(true);
    expect(coverage?.include).toEqual([
      "src/**/*.ts",
      "scripts/skills/**/*.ts",
      "integrations/pi/security.ts",
      "integrations/openclaw/plugin.mjs",
    ]);
    expect(coverage?.exclude).toEqual(["src/**/*.d.ts", "src/xenova.d.ts"]);
    expect(coverage?.include).not.toContain("vitest.config.ts");
    expect(coverage?.include).not.toContain("eslint.config.js");
    expect(coverage?.reportsDirectory).toBe("coverage");
    expect(coverage?.reporter).toEqual(["text", "json-summary", "html"]);
    expect(coverage?.thresholds).toEqual({
      lines: 20,
      functions: 20,
      branches: 15,
      statements: 20,
    });
  });

  it("enforces scoped CLI/hooks/connect coverage thresholds", () => {
    const testConfig = (cliHooksConfig as RootVitestConfig).test;
    const coverage = testConfig?.coverage;

    expect(testConfig?.testTimeout).toBe(10_000);
    expect(coverage?.provider).toBe("v8");
    expect(coverage?.all).toBe(true);
    expect(coverage?.include).toEqual([
      "src/cli/ready-hint.ts",
      "src/cli/remove-plan.ts",
      "src/cli/connect/codex-hooks.ts",
      "src/cli/connect/copilot-cli.ts",
      "src/cli/connect/opencode.ts",
      "src/cli/connect/util.ts",
      "src/hooks/_http.ts",
      "src/hooks/_project.ts",
      "src/hooks/sdk-guard.ts",
    ]);
    expect(coverage?.reportsDirectory).toBe("coverage/cli-hooks");
    expect(coverage?.thresholds).toEqual({
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    });
  });

  it("keeps coverage reports out of git", () => {
    expect(readText(".gitignore")).toMatch(/^coverage\/$/m);
  });

  it("wires lint and coverage into CI without running coverage on every matrix cell", () => {
    const ci = readText(".github/workflows/ci.yml");

    expect(ciRunCount("pnpm run lint")).toBe(1);
    expect(ciRunCount("pnpm run coverage")).toBe(1);
    expect(ciRunCount("pnpm test")).toBe(1);
    expect(ci).toContain("corepack enable");
    expect(ci).toContain("pnpm install --frozen-lockfile --ignore-scripts");
    expect(ci).toContain("pnpm run lint");
    expect(ci).toContain("pnpm run coverage");
    expect(ci).not.toContain("package-lock-only");
    expect(ci).not.toContain("npm ci");
    expect(ci).toContain("actions/upload-artifact@v4");
    expect(ci).toContain("name: coverage-report");
    expect(ci).toContain("path: coverage/");
    expect(ci).toContain("if-no-files-found: error");
    expect(ci).toContain("retention-days: 7");
    expect(ci).toContain("matrix.os == 'ubuntu-latest' && matrix.node-version == 22");
  });

  it("builds publish artifacts from the committed pnpm lockfile before npm publish", () => {
    const publish = readText(".github/workflows/publish.yml");

    const setup = indexOfStep(publish, "run: corepack enable");
    const install = indexOfStep(publish, "run: pnpm install --frozen-lockfile --ignore-scripts");
    const build = indexOfStep(publish, "run: pnpm run build");
    const test = indexOfStep(publish, "run: pnpm test");
    const rootPack = indexOfStep(publish, "run: npm pack --dry-run --json");
    const mcpPack = indexOfStep(
      publish,
      "working-directory: packages/mcp\n        run: pnpm pack --dry-run --json",
    );
    const fsWatcherPack = indexOfStep(
      publish,
      "working-directory: integrations/filesystem-watcher\n        run: npm pack --dry-run --json",
    );
    const rootPublish = indexOfStep(publish, "name: Publish @agentmemory/agentmemory");
    const mcpPublish = indexOfStep(publish, "name: Publish @agentmemory/mcp shim");
    const fsWatcherPublish = indexOfStep(
      publish,
      "name: Publish @agentmemory/fs-watcher connector",
    );
    const prePublishSteps = [setup, install, build, test, rootPack, mcpPack, fsWatcherPack];
    const packSteps = [rootPack, mcpPack, fsWatcherPack];
    const publishSteps = [rootPublish, mcpPublish, fsWatcherPublish];

    expect(prePublishSteps).toEqual([...prePublishSteps].sort((a, b) => a - b));
    expect(Math.max(...packSteps)).toBeLessThan(Math.min(...publishSteps));
    expect(rootPack).toBeLessThan(rootPublish);
    expect(mcpPack).toBeLessThan(mcpPublish);
    expect(fsWatcherPack).toBeLessThan(fsWatcherPublish);
    expect(publish).toContain("pnpm publish --provenance --access public --no-git-checks");
    expect(publish).not.toContain("package-lock-only");
    expect(publish).not.toContain("npm ci");
  });

  it("enforces the committed pnpm lockfile policy", () => {
    const packageManifests = [
      "package.json",
      "website/package.json",
      "packages/mcp/package.json",
      "integrations/filesystem-watcher/package.json",
      "integrations/openclaw/package.json",
      "integrations/pi/package.json",
    ];

    for (const path of packageManifests) {
      const pkg = JSON.parse(readText(path)) as PackageJson;
      expect(pkg.packageManager, path).toBe("pnpm@11.6.0");
    }

    const workspace = readText("pnpm-workspace.yaml");
    expectTopLevelYamlScalar(workspace, "autoInstallPeers", "false");
    expectTopLevelYamlScalar(workspace, "savePrefix", '""');
    expectTopLevelYamlScalar(workspace, "minimumReleaseAge", "1440");
    expectTopLevelYamlScalar(workspace, "minimumReleaseAgeStrict", "true");
    expectTopLevelYamlScalar(workspace, "minimumReleaseAgeIgnoreMissingTime", "false");
    expectTopLevelYamlScalar(workspace, "blockExoticSubdeps", "true");
    expectTopLevelYamlScalar(workspace, "strictDepBuilds", "true");
    expectTopLevelYamlScalar(workspace, "dangerouslyAllowAllBuilds", "false");
    expectTopLevelYamlScalar(workspace, "trustPolicy", "no-downgrade");

    const lockfile = readText("pnpm-lock.yaml");
    const lockfileLines = lockfile.split(/\r?\n/).map((line) => line.trim());
    for (const importer of [
      ".",
      "website",
      "packages/mcp",
      "integrations/filesystem-watcher",
      "integrations/openclaw",
      "integrations/pi",
      ]) {
      expect(
        lockfileLines.includes(`${importer}:`) ||
          lockfileLines.includes(`${importer}: {}`),
      ).toBe(true);
    }

    expect(readText(".gitignore")).not.toMatch(/^pnpm-lock\.yaml$/m);
    expect(readText("website/.gitignore")).not.toMatch(/^pnpm-lock\.yaml$/m);
  });

  it("uses a pnpm workspace dependency for the MCP shim source package", () => {
    const mcp = JSON.parse(readText("packages/mcp/package.json")) as PackageJson;

    expect(mcp.dependencies?.["@agentmemory/agentmemory"]).toBe("workspace:~");
  });

  it("does not auto-install Anthropic packages in the root package", () => {
    const pkg = readPackageJson();
    const autoInstallSurfaces = [
      pkg.dependencies ?? {},
      pkg.optionalDependencies ?? {},
    ];
    const bundled = [
      ...(pkg.bundledDependencies ?? []),
      ...(pkg.bundleDependencies ?? []),
    ];

    for (const deps of autoInstallSurfaces) {
      expect(deps["@anthropic-ai/sdk"]).toBeUndefined();
      expect(deps["@anthropic-ai/claude-agent-sdk"]).toBeUndefined();
    }
    expect(bundled).not.toContain("@anthropic-ai/sdk");
    expect(bundled).not.toContain("@anthropic-ai/claude-agent-sdk");
    expect(pkg.peerDependencies?.["@anthropic-ai/claude-agent-sdk"]).toBe("^0.3.142");
    expect(pkg.peerDependenciesMeta?.["@anthropic-ai/claude-agent-sdk"]?.optional).toBe(true);
  });

  it("keeps the OSV waiver narrow and time-bounded", () => {
    const configPath = "osv-scanner.toml";
    expect(existsSync(configPath), "root OSV scanner config is required").toBe(true);

    const config = existsSync(configPath) ? readText(configPath) : "";
    expect(config.match(/^\[\[IgnoredVulns\]\]$/gm)).toHaveLength(1);
    expect(config).toMatch(/^id = "GHSA-8988-4f7v-96qf"$/m);
    expect(config).toMatch(/^ignoreUntil = 2026-07-16$/m);
    expect(config).toMatch(/iii-sdk@0\.11\.2/);
    expect(config).toMatch(/@opentelemetry\/core@1\.30\.1/);
    expect(config).toMatch(/@opentelemetry\/core >=2\.8\.0/);
    expect(config).not.toMatch(/^\[\[PackageOverrides\]\]$/m);
    expect(config).not.toMatch(/^ignore = true$/m);
    expect(config).not.toMatch(/^nameIsRegex = true$/m);
  });
});
