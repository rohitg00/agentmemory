import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import eslintConfig from "../eslint.config.js";
import vitestConfig from "../vitest.config";

type PackageJson = {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
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

    expect(testConfig?.testTimeout).toBe(10_000);
    expect(coverage?.provider).toBe("v8");
    expect(coverage?.all).toBe(true);
    expect(coverage?.include).toEqual(["src/**/*.ts"]);
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

  it("keeps coverage reports out of git", () => {
    expect(readText(".gitignore")).toMatch(/^coverage\/$/m);
  });

  it("wires lint and coverage into CI without running coverage on every matrix cell", () => {
    const ci = readText(".github/workflows/ci.yml");

    expect(ciRunCount("npm run lint")).toBe(1);
    expect(ciRunCount("npm run coverage")).toBe(1);
    expect(ci).toContain("npm run lint");
    expect(ci).toContain("npm run coverage");
    expect(ci).toContain("actions/upload-artifact@v4");
    expect(ci).toContain("name: coverage-report");
    expect(ci).toContain("path: coverage/");
    expect(ci).toContain("if-no-files-found: error");
    expect(ci).toContain("retention-days: 7");
    expect(ci).toContain("matrix.os == 'ubuntu-latest' && matrix.node-version == 22");
  });
});
