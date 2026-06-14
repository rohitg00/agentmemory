# Lint Coverage Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a root ESLint CI gate and a Vitest coverage gate with reports and initial thresholds for the agentmemory root package.

**Architecture:** Keep this scoped to the root TypeScript/Vitest project. Add one ESLint flat config, one Vitest coverage config, root package scripts, a small meta-test that locks the gates in place, and one CI update that runs lint once and coverage once while preserving the existing OS/Node test matrix.

**Tech Stack:** Node >=20, npm, TypeScript ESM, ESLint flat config, `typescript-eslint`, Vitest V8 coverage, GitHub Actions.

---

## Scope Check

This plan covers two related quality gates in one root-project implementation:

- Root lint/format gate: satisfy the requested "mindestens lint oder eslint/prettier --check" requirement with ESLint linting. Do not add Prettier in this task; the repo has no current Prettier config, and introducing a formatter would risk a broad formatting-only diff.
- Coverage metric: use Vitest V8 coverage with HTML, text, and JSON summary reports plus conservative initial thresholds.

Website lint/build remains out of scope. Security scanner CI gates remain out of scope because the project already runs Semgrep/Gitleaks/OSV through the agent commit policy; this plan only adds lint and coverage.

## File Structure

- Create `eslint.config.js`: root ESLint flat config for source, tests, scripts, benchmarks, eval runners, and the TypeScript pi integration.
- Create `vitest.config.ts`: root Vitest coverage configuration; normal `npm test` behavior remains script-driven and still excludes `test/integration.test.ts`.
- Create `test/quality-gates.test.ts`: meta-test proving package scripts, configs, `.gitignore`, and CI gate wiring stay present.
- Modify `package.json`: add lint and coverage scripts; add exact dev tool versions.
- Modify `.gitignore`: ignore generated `coverage/` reports.
- Modify `.github/workflows/ci.yml`: run lint once in the existing matrix, run coverage once on Ubuntu/Node 22, upload the coverage directory as a CI artifact, and keep ordinary tests on the other matrix cells.

## Dependency Intake

Verified with `npm view` on 2026-06-14:

- `eslint@10.5.0`: accept. Needed for root lint gate. No standard-library alternative.
- `@eslint/js@10.0.1`: accept. Official ESLint recommended rules package for flat config.
- `typescript-eslint@8.61.0`: accept. Needed to parse and lint TypeScript; peer dependencies support `eslint` `^8.57.0 || ^9.0.0 || ^10.0.0` and `typescript >=4.8.4 <6.1.0`.
- `globals@17.6.0`: accept. Keeps Node and Vitest globals explicit without manually maintaining a long global map.
- `vitest@4.1.8`: accept. Aligns the root Vitest direct dependency with the coverage provider peer dependency.
- `@vitest/coverage-v8@4.1.8`: accept. Official V8 coverage provider for Vitest 4.1.8.

Install with exact versions. Do not commit generated lockfiles because this repo intentionally ignores lock files.

## Task 1: Add Failing Meta-Test For Quality Gates

**Files:**
- Create: `test/quality-gates.test.ts`

- [ ] **Step 1: Write the failing meta-test**

Create `test/quality-gates.test.ts` with this exact content:

```ts
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
```

- [ ] **Step 2: Bootstrap local test tooling if needed**

Before running the red test, verify that `node_modules/.bin/vitest` exists. If it is missing in a fresh checkout, run the same local bootstrap shape used by CI:

```bash
npm install --package-lock-only --legacy-peer-deps --no-audit --no-fund
npm ci --legacy-peer-deps --no-audit --no-fund
```

Do not commit `package-lock.json`; this repo intentionally ignores generated lockfiles.

- [ ] **Step 3: Run the meta-test and verify it fails**

Run:

```bash
npx --no-install vitest run test/quality-gates.test.ts --exclude test/integration.test.ts
```

Expected result:

```text
FAIL  test/quality-gates.test.ts
```

At least one assertion must fail because `lint`, `coverage`, `eslint.config.js`, `vitest.config.ts`, coverage thresholds/report config, `coverage/`, and the CI coverage wiring do not exist yet.

- [ ] **Step 4: Commit the failing test only if the team wants red commits**

Default for this repo is not to commit a failing intermediate state. Leave the file uncommitted until Task 4 unless the reviewer explicitly asks for red/green commit history.

## Task 2: Add ESLint Root Gate

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json`
- Test: `test/quality-gates.test.ts`

- [ ] **Step 1: Install exact ESLint dependencies**

Run:

```bash
npm install --save-dev --save-exact eslint@10.5.0 @eslint/js@10.0.1 typescript-eslint@8.61.0 globals@17.6.0
```

Expected result:

```text
added
```

`package.json` must contain these exact dev dependency entries:

```json
{
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "eslint": "10.5.0",
    "globals": "17.6.0",
    "typescript-eslint": "8.61.0"
  }
}
```

Do not commit `package-lock.json`; it is intentionally ignored by this repo.

- [ ] **Step 2: Add the lint script**

Modify the `scripts` object in `package.json` so it contains this exact script entry:

```json
{
  "scripts": {
    "lint": "eslint \"src/**/*.{ts,tsx,js,mjs}\" \"test/**/*.ts\" \"scripts/**/*.ts\" \"benchmark/**/*.ts\" \"eval/**/*.ts\" \"integrations/pi/**/*.ts\""
  }
}
```

Keep the existing scripts unchanged.

- [ ] **Step 3: Create the ESLint flat config**

Create `eslint.config.js` with this exact content:

```js
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
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
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.es2022,
        ...globals.node,
      },
    },
    rules: {
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
    },
  },
  {
    files: ["test/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
  },
);
```

- [ ] **Step 4: Run ESLint and fix only real lint findings**

Run:

```bash
npm run lint
```

Expected result after this task is complete:

```text
> agentmemory@... lint
> eslint ...
```

Exit code must be `0`.

If ESLint reports existing source findings, fix them only when they are inside the linted root surface and are mechanical with no behavior change. If a small set of broad legacy rule families creates a large red baseline across unrelated files, keep the gate scoped by explicitly disabling those baseline rules in `eslint.config.js` and record the reason in `todo.md`. Examples of acceptable fixes in this task:

```ts
// Before
catch (error) {
  return fallback;
}

// After
catch (_error) {
  return fallback;
}
```

```ts
// Before
const unused = computeDebugValue();
return value;

// After
return value;
```

Do not refactor behavior to satisfy lint. If a finding requires behavior design, stop and split it into a separate task.

- [ ] **Step 5: Run the meta-test again**

Run:

```bash
npx --no-install vitest run test/quality-gates.test.ts --exclude test/integration.test.ts
```

Expected result at this point:

```text
FAIL  test/quality-gates.test.ts
```

The lint script and ESLint dependency assertions should now pass. The coverage config, coverage dependency, `.gitignore`, and CI assertions should still fail.

## Task 3: Add Vitest Coverage Script, Reports, And Thresholds

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Modify: `.gitignore`
- Test: `test/quality-gates.test.ts`

- [ ] **Step 1: Install exact Vitest coverage dependencies**

Run:

```bash
npm install --save-dev --save-exact vitest@4.1.8 @vitest/coverage-v8@4.1.8
```

Expected result:

```text
changed
```

`package.json` must contain these exact dev dependency entries:

```json
{
  "devDependencies": {
    "@vitest/coverage-v8": "4.1.8",
    "vitest": "4.1.8"
  }
}
```

Do not commit `package-lock.json`; it is intentionally ignored by this repo.

- [ ] **Step 2: Add the coverage script**

Modify the `scripts` object in `package.json` so it contains this exact script entry:

```json
{
  "scripts": {
    "coverage": "vitest run --coverage --exclude test/integration.test.ts"
  }
}
```

Keep `test`, `test:integration`, and `test:all` unchanged.

- [ ] **Step 3: Create Vitest coverage config**

Create `vitest.config.ts` with this exact content:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/xenova.d.ts",
      ],
      reportsDirectory: "coverage",
      reporter: ["text", "json-summary", "html"],
      thresholds: {
        lines: 20,
        functions: 20,
        branches: 15,
        statements: 20,
      },
    },
  },
});
```

The initial thresholds are intentionally conservative. They make coverage visible and enforce that it cannot be accidentally disabled, without forcing unrelated test-writing across the whole memory engine in this change.

- [ ] **Step 4: Ignore generated coverage reports**

Append this exact block to `.gitignore` near the existing report/output ignores:

```gitignore

# Vitest coverage reports
coverage/
```

- [ ] **Step 5: Run coverage locally**

Run:

```bash
npm run coverage
```

Expected result:

```text
PASS
% Coverage report from v8
```

Expected generated files:

```text
coverage/index.html
coverage/coverage-summary.json
```

If coverage fails only because one of the exact thresholds is higher than the measured baseline, set the threshold to the integer floor of the measured value shown in the text report and rerun `npm run coverage`. Example with concrete math:

```text
Measured lines: 18.94%
Set lines threshold to 18
```

Do not raise a threshold above the measured baseline in this task.

- [ ] **Step 6: Run the meta-test again**

Run:

```bash
npx --no-install vitest run test/quality-gates.test.ts --exclude test/integration.test.ts
```

Expected result at this point:

```text
FAIL  test/quality-gates.test.ts
```

The package, config, and `.gitignore` assertions should now pass. The CI assertions should still fail.

## Task 4: Wire Lint And Coverage Into CI

**Files:**
- Modify: `.github/workflows/ci.yml`
- Test: `test/quality-gates.test.ts`

- [ ] **Step 1: Add lint once and replace one test matrix cell with coverage**

Modify the final CI steps in `.github/workflows/ci.yml` from this shape:

```yaml
      - run: npm run build
      - run: npm run skills:check
      - run: npm test
```

to this exact block:

```yaml
      - run: npm run build
      - run: npm run skills:check
      - if: ${{ matrix.os == 'ubuntu-latest' && matrix.node-version == 22 }}
        run: npm run lint
      - if: ${{ matrix.os == 'ubuntu-latest' && matrix.node-version == 22 }}
        run: npm run coverage
      - if: ${{ !(matrix.os == 'ubuntu-latest' && matrix.node-version == 22) }}
        run: npm test
      - if: ${{ matrix.os == 'ubuntu-latest' && matrix.node-version == 22 }}
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/
          if-no-files-found: error
```

This keeps the existing matrix breadth:

- Ubuntu/Node 20: build, skills check, `npm test`
- Ubuntu/Node 22: build, skills check, `npm run lint`, `npm run coverage`, coverage artifact
- macOS/Node 20: build, skills check, `npm test`
- macOS/Node 22: build, skills check, `npm test`

- [ ] **Step 2: Run the meta-test and verify it passes**

Run:

```bash
npx --no-install vitest run test/quality-gates.test.ts --exclude test/integration.test.ts
```

Expected result:

```text
PASS  test/quality-gates.test.ts
```

- [ ] **Step 3: Run the root lint gate**

Run:

```bash
npm run lint
```

Expected result:

```text
Exit code 0
```

- [ ] **Step 4: Run the coverage gate**

Run:

```bash
npm run coverage
```

Expected result:

```text
Exit code 0
coverage/index.html
coverage/coverage-summary.json
```

- [ ] **Step 5: Run the existing root verification gates**

Run:

```bash
npm run build
npm run skills:check
npm test
```

Expected result:

```text
npm run build: Exit code 0
npm run skills:check: Exit code 0
npm test: Exit code 0
```

If `npm test` hits the known unrelated `test/fs-watcher.test.ts` timing flake, rerun this exact file once:

```bash
npx --no-install vitest run test/fs-watcher.test.ts --exclude test/integration.test.ts
```

Expected result for accepting the run as a flake:

```text
PASS  test/fs-watcher.test.ts
```

Then rerun full `npm test` once. Do not change `fs-watcher` in this lint/coverage task.

## Task 5: Dependency And Security Verification

**Files:**
- Modify: no source files in this task
- Verify: dependency, scanner, and staged content checks

- [ ] **Step 1: Review dependency diff**

Run:

```bash
git diff -- package.json
```

Expected dependency changes:

```diff
+    "@eslint/js": "10.0.1",
+    "@vitest/coverage-v8": "4.1.8",
+    "eslint": "10.5.0",
+    "globals": "17.6.0",
+    "typescript-eslint": "8.61.0",
-    "vitest": "^4.1.6"
+    "vitest": "4.1.8"
```

Confirm no lockfile is staged:

```bash
git status --short
```

Expected result:

```text
 M .github/workflows/ci.yml
 M .gitignore
 M package.json
?? eslint.config.js
?? test/quality-gates.test.ts
?? vitest.config.ts
```

`package-lock.json` may exist locally as ignored output. Do not stage it.

- [ ] **Step 2: Run OSV because dependency metadata changed**

Run the AGENTS fallback first:

```bash
osv-scanner scan source .
```

For this repo's generated-lockfile policy, if that reports no package sources because `package-lock.json` is gitignored, run:

```bash
osv-scanner scan source --no-ignore .
```

Expected result:

```text
No issues found
```

If `osv-scanner` is not installed, stop and ask for approval before installing or changing the scanner command. Do not skip OSV silently because this task changes direct dev dependencies.

- [ ] **Step 3: Run Semgrep because CI/tooling/dependency surfaces changed**

Run:

```bash
semgrep scan --config p/default --error --metrics=off .
```

Expected result:

```text
0 findings
```

- [ ] **Step 4: Stage only task-owned files**

Run:

```bash
git add package.json eslint.config.js vitest.config.ts test/quality-gates.test.ts .gitignore .github/workflows/ci.yml plugin/skills/agentmemory-config/REFERENCE.md docs/todos/2026-06-14-lint-coverage-gates/plan.md docs/todos/2026-06-14-lint-coverage-gates/todo.md
```

Expected result:

```text
Exit code 0
```

- [ ] **Step 5: Run staged secret scan**

Run:

```bash
gitleaks protect --staged --redact
```

Expected result:

```text
no leaks found
```

- [ ] **Step 6: Check staged diff and whitespace**

Run:

```bash
git diff --cached --name-status
git diff --cached --check
```

Expected name-status includes the gate files, task record, and any repo-native generated docs needed by verification:

```text
M	.github/workflows/ci.yml
M	.gitignore
M	package.json
M	plugin/skills/agentmemory-config/REFERENCE.md
A	docs/todos/2026-06-14-lint-coverage-gates/plan.md
A	docs/todos/2026-06-14-lint-coverage-gates/todo.md
A	eslint.config.js
A	test/quality-gates.test.ts
A	vitest.config.ts
```

Expected `git diff --cached --check` output:

```text
```

- [ ] **Step 7: Commit**

Run:

```bash
git commit -m "chore: add root lint and coverage gates"
```

Expected result:

```text
[branch ...] chore: add root lint and coverage gates
```

## Acceptance Criteria

- `npm run lint` exists and exits `0`.
- The root lint/format gate requirement is fulfilled by the ESLint lint gate; no Prettier or separate format check is added in this task.
- `npm run coverage` exists, exits `0`, enforces thresholds, prints a V8 text report, and writes `coverage/index.html` plus `coverage/coverage-summary.json`.
- `.gitignore` ignores `coverage/`.
- CI runs lint once on Ubuntu/Node 22.
- CI runs coverage once on Ubuntu/Node 22 and uploads `coverage-report`.
- Existing CI matrix still runs ordinary `npm test` on the other three OS/Node cells.
- `npm run build`, `npm run skills:check`, and `npm test` still pass locally.
- OSV, Semgrep, and staged Gitleaks are recorded in the handoff because dependency and CI/tooling surfaces changed.

## Self-Review

Spec coverage:

- Root lint/format gate: Task 2 adds the chosen ESLint gate and script; Task 4 wires it into CI. The plan explicitly chooses lint-only because the approved requirement allows lint or a formatter check.
- Coverage metric: Task 3 adds coverage script, reports, and thresholds; Task 4 wires coverage into CI and uploads a report.
- Visible reports: Task 3 creates local HTML/JSON coverage outputs; Task 4 uploads them as the `coverage-report` artifact.

Placeholder scan:

- No banned placeholder phrases remain.
- Every code/config edit step contains exact content.
- Every command includes an expected result.

Type consistency:

- `test/quality-gates.test.ts` checks exactly the scripts and config files created in Tasks 2 and 3.
- The CI string checked by the meta-test matches the YAML condition used in Task 4.
- Coverage threshold names match Vitest V8 coverage config keys: `lines`, `functions`, `branches`, and `statements`.

## Execution Handoff

Plan complete and saved to `docs/todos/2026-06-14-lint-coverage-gates/plan.md`. Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
