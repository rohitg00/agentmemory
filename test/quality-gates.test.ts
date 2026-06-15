import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
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

function readText(path: string): string {
  return readFileSync(path, "utf-8");
}

function readPackageJson(): PackageJson {
  return JSON.parse(readText("package.json")) as PackageJson;
}

describe("root quality gates", () => {
  it("exposes lint and coverage scripts in package.json", () => {
    const pkg = readPackageJson();

    expect(pkg.scripts?.lint).toBe(
      'eslint "src/**/*.{ts,tsx,js,mjs}" "test/**/*.ts" "scripts/**/*.ts" "benchmark/**/*.ts" "eval/**/*.ts" "integrations/pi/**/*.ts"',
    );
    expect(pkg.scripts?.coverage).toBe(
      "vitest run --coverage --exclude test/integration.test.ts",
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

  it("enforces root coverage thresholds and reports", () => {
    const testConfig = (vitestConfig as RootVitestConfig).test;
    const coverage = testConfig?.coverage;

    expect(testConfig?.testTimeout).toBe(10_000);
    expect(coverage?.provider).toBe("v8");
    expect(coverage?.all).toBe(true);
    expect(coverage?.include).toEqual(["src/**/*.ts"]);
    expect(coverage?.exclude).toEqual(["src/**/*.d.ts", "src/xenova.d.ts"]);
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

    expect(ci).toContain("npm run lint");
    expect(ci).toContain("npm run coverage");
    expect(ci).toContain("actions/upload-artifact@v4");
    expect(ci).toContain("name: coverage-report");
    expect(ci).toContain("matrix.os == 'ubuntu-latest' && matrix.node-version == 22");
  });
});
