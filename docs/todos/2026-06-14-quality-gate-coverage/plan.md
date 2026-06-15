# Quality Gate Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stronger meta-tests so lint, coverage, and CI gate drift is caught across the scoped quality infrastructure surface.

**Architecture:** Keep the source behavior unchanged. Expand `test/quality-gates.test.ts` with structured readers for `package.json`, `vitest.config.ts`, `eslint.config.js`, and `.github/workflows/ci.yml`, then assert the exact gate contract from the existing configs. Use Red/Green by first writing assertions for a helper/contract shape that does not yet exist, observe the targeted test fail, then add the minimal helper/assertion structure.

**Tech Stack:** TypeScript ESM, Vitest, ESLint flat config, GitHub Actions YAML inspected as text.

---

## Task 1: Restore Local Verification Tooling

**Files:**
- Read: `package.json`

- [ ] **Step 1: Check whether `node_modules/.bin/vitest` exists**

Run:

```bash
test -x node_modules/.bin/vitest
```

Expected: exit 0 if local dependencies are already installed.

- [ ] **Step 2: Install existing project dependencies only when missing**

Run:

```bash
npm install --package-lock-only --legacy-peer-deps --no-audit --no-fund
npm ci --legacy-peer-deps --no-audit --no-fund
```

Expected: `node_modules/.bin/vitest` and `node_modules/.bin/eslint` exist. Do not commit generated lockfiles.

## Task 2: Add Red Meta-Tests For Gate Drift

**Files:**
- Modify: `test/quality-gates.test.ts`

- [ ] **Step 1: Add assertions for missing drift cases**

Add tests that require:

```ts
expect(pkg.scripts?.test).toBe("vitest run --exclude test/integration.test.ts");
expect(pkg.scripts?.coverage).toBe("vitest run --coverage --exclude test/integration.test.ts");
expect(coverage?.provider).toBe("v8");
expect(coverage?.reporter).toEqual(["text", "json-summary", "html"]);
expect(coverage?.thresholds).toEqual({ lines: 20, functions: 20, branches: 15, statements: 20 });
expect(coverage?.exclude).toEqual(["src/**/*.d.ts", "src/xenova.d.ts"]);
```

Also import `eslint.config.js` and assert the flat config contains ignored generated/runtime paths, baseline rule disables, and Vitest globals for tests.

- [ ] **Step 2: Add CI artifact drift assertions**

Assert the Ubuntu/Node 22 coverage cell runs `npm run lint`, runs `npm run coverage`, uploads `coverage/`, uses artifact name `coverage-report`, and sets `if-no-files-found: error`.

- [ ] **Step 3: Run targeted test and observe red**

Run:

```bash
npm test -- test/quality-gates.test.ts
```

Expected: fail because at least one new helper or assertion is not satisfied yet. If the current code already satisfies all new assertions, temporarily assert one legitimate missing contract first, then remove the temporary assertion after confirming the test catches drift.

## Task 3: Make The Meta-Tests Green Without Source-Coverage Distortion

**Files:**
- Modify: `test/quality-gates.test.ts`
- Modify only if tests expose a real gap: `vitest.config.ts`, `eslint.config.js`, `.github/workflows/ci.yml`, `package.json`

- [ ] **Step 1: Add minimal inspection helpers**

Use small local helpers in `test/quality-gates.test.ts` for:

```ts
function findStringArrayProperty(configs: unknown[], property: string): string[] | undefined;
function findRuleConfig(configs: unknown[], rule: string): unknown;
function readPackageJson(): PackageJson;
```

- [ ] **Step 2: Keep `vitest.config.ts` source include unchanged**

Verify `coverage.include` remains:

```ts
["src/**/*.ts"]
```

Do not include root config files in numeric V8 coverage in this task.

- [ ] **Step 3: Run the targeted test and verify green**

Run:

```bash
npm test -- test/quality-gates.test.ts
```

Expected: 1 file passes and the test count increases beyond the previous 6 assertions.

## Task 4: Simplification Pass

**Files:**
- Review: `test/quality-gates.test.ts`

- [ ] **Step 1: Reread the diff**

Run:

```bash
git diff -- test/quality-gates.test.ts vitest.config.ts eslint.config.js .github/workflows/ci.yml package.json docs/todos/2026-06-14-quality-gate-coverage
```

Expected: only scoped tests/task docs/config fixes are present.

- [ ] **Step 2: Remove avoidable helper complexity**

Prefer explicit assertions when they are clearer than generalized parsing. Keep helpers only where they make multiple drift checks easier to read.

## Task 5: Verification And Commit

**Files:**
- Stage only scoped changes.

- [ ] **Step 1: Run required verification**

Run:

```bash
npm test -- test/quality-gates.test.ts
npm run lint
npm run coverage
npm test
semgrep scan --config p/default --error --metrics=off test/quality-gates.test.ts vitest.config.ts eslint.config.js .github/workflows/ci.yml package.json
```

Expected: all commands exit 0. Run OSV only if dependency/package surfaces change.

- [ ] **Step 2: Stage and scan staged content**

Run:

```bash
git add test/quality-gates.test.ts package.json .github/workflows/ci.yml docs/todos/2026-06-14-quality-gate-coverage/todo.md docs/todos/2026-06-14-quality-gate-coverage/plan.md
gitleaks protect --staged --redact
```

Expected: no leaks found.

- [ ] **Step 3: Commit scoped changes**

Run:

```bash
git commit -m "test: strengthen quality gate coverage"
```

Expected: commit succeeds on branch `coverage/quality-gates`.
