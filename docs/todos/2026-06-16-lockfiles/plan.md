# Lockfile Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move this fork from ignored, generated npm lockfiles to committed pnpm lockfiles for reproducible installs and stronger supply-chain verification.

**Architecture:** The fork adopts `pnpm` as the source-development package manager, records one root workspace lockfile, and updates CI/publish jobs to install from that committed lockfile. npm and npx remain valid for end-user installation from the public npm registry; package publishing stays npm-compatible, with pnpm used only where workspace dependency rewriting is required.

**Tech Stack:** pnpm 11.6.0, Corepack, GitHub Actions, existing TypeScript/vitest/tsdown scripts, OSV Scanner, Semgrep, Gitleaks.

---

## Current Evidence

- Worktree: `/Users/A1538552/.codex/worktrees/4fa9/agentmemory`
- Branch: `lockfile`
- Baseline status: `git status -sb` returned `## lockfile`.
- `npm view pnpm version` returned `11.7.0` on 2026-06-16, but `11.7.0` was published on 2026-06-15 and does not satisfy the 1440-minute release-age policy yet. `pnpm@11.6.0` was published on 2026-06-11 and is the planned pin.
- Current root `.gitignore` ignores `package-lock.json`, `pnpm-lock.yaml`, and `yarn.lock`.
- Current `website/.gitignore` ignores `package-lock.json`, `pnpm-lock.yaml`, and `yarn.lock`.
- Current CI and publish workflows generate a temporary npm lockfile with `npm install --package-lock-only --legacy-peer-deps --no-audit --no-fund`, then run `npm ci --legacy-peer-deps --no-audit --no-fund`.
- Package surfaces found in this repository:
  - `package.json`
  - `website/package.json`
  - `packages/mcp/package.json`
  - `integrations/filesystem-watcher/package.json`
  - `integrations/openclaw/package.json`
  - `integrations/pi/package.json`

## Migration Shape

This is one package-manager and lockfile migration, not two serial migrations.

The implementation must not introduce a committed `package-lock.json` as an intermediate state. The first committed lockfile should be the canonical `pnpm-lock.yaml`, generated after all participating `package.json` files have the `packageManager` pin and after `pnpm-workspace.yaml` contains the workspace and pnpm hardening config.

The work is still split into checkpoints: metadata first, lockfile generation second, workflow/docs third, verification last. Those checkpoints are for review and rollback clarity inside one change set.

## File Structure

- `package.json`: add `"packageManager": "pnpm@11.6.0"` and keep existing npm `overrides` for npm fallback behavior.
- `website/package.json`, `packages/mcp/package.json`, `integrations/filesystem-watcher/package.json`, `integrations/openclaw/package.json`, `integrations/pi/package.json`: add the same `"packageManager": "pnpm@11.6.0"` pin so every participating manifest resolves with the same toolchain.
- `pnpm-workspace.yaml`: create the pnpm workspace definition covering root, website, package shims, and integration package manifests; put pnpm hardening settings, workspace linking, and pnpm overrides here, not in a committed `.npmrc`.
- `pnpm-lock.yaml`: generate and commit the root workspace lockfile.
- `.gitignore`: stop ignoring `pnpm-lock.yaml`; keep non-canonical lockfiles ignored.
- `website/.gitignore`: stop ignoring `pnpm-lock.yaml`; keep non-canonical lockfiles ignored.
- `.github/workflows/ci.yml`: replace temporary npm lockfile generation with Corepack plus `pnpm install --frozen-lockfile`.
- `.github/workflows/publish.yml`: replace temporary npm lockfile generation with Corepack plus `pnpm install --frozen-lockfile`; keep `npm publish --provenance` for packages without workspace dependencies and use `pnpm publish --provenance --access public --no-git-checks` for `packages/mcp` so `workspace:` dependencies are rewritten for npm consumers.
- `test/quality-gates.test.ts`: update workflow-command assertions so the required CI gates expect pnpm commands and preserved matrix guards.
- `test/plugin-surface-contract.test.ts`: update the package-surface contract for the MCP shim's source-time `workspace:~` dependency.
- `README.md`, `website/README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `AGENTS.md`, `docs/recipes/fork-workflow.md`: update active contributor/source workflow guidance from npm-generated lockfiles to committed pnpm lockfiles while preserving npm/npx end-user installation commands.
- `website/next.config.ts`: set the Turbopack root to the pnpm workspace root so Next can resolve pnpm symlinked dependencies during website builds.
- `scripts/skills/generate.ts` and generated plugin skill references: update source-development command text through the generator, then regenerate skill docs.
- `docs/adr/0005-use-committed-lockfiles-in-the-fork.md`: already records the durable decision.
- `docs/todos/2026-06-16-lockfiles/todo.md`: update progress, verification evidence, and final review notes during execution.

## Task 1: Confirm Baseline And Tooling

**Files:**
- Modify: `docs/todos/2026-06-16-lockfiles/todo.md`

- [ ] **Step 1: Confirm repository status**

Run:

```bash
git status -sb
```

Expected before implementation:

```text
## lockfile
?? docs/adr/0005-use-committed-lockfiles-in-the-fork.md
?? docs/todos/2026-06-16-lockfiles/
```

If tracked files are already modified, inspect them with `git diff --stat` and record whether they are task-owned before continuing.

- [ ] **Step 2: Confirm package-manager version used by the plan**

Run:

```bash
npm view pnpm@11.6.0 time version --json
```

Expected on 2026-06-16:

```json
{
  "version": "11.6.0",
  "time": "2026-06-11T23:06:54.463Z"
}
```

If the output differs, stop and update this plan with release-age evidence before changing package metadata. Do not pin a pnpm release that is newer than the repository's 1440-minute minimum release age.

- [ ] **Step 3: Confirm package surfaces**

Run:

```bash
rg --files -g 'package.json'
```

Expected package manifests:

```text
integrations/filesystem-watcher/package.json
integrations/openclaw/package.json
integrations/pi/package.json
package.json
packages/mcp/package.json
website/package.json
```

- [ ] **Step 4: Confirm current lockfile ignore rules**

Run:

```bash
rg -n 'package-lock|pnpm-lock|yarn.lock|Lock files' .gitignore website/.gitignore
```

Expected: both `.gitignore` and `website/.gitignore` currently mention `pnpm-lock.yaml`.

- [ ] **Step 5: Confirm there is no transitional lockfile plan**

Read the `Migration Shape` section in this file and confirm it says the first committed lockfile is `pnpm-lock.yaml`, not `package-lock.json`.

Expected: the migration shape explicitly forbids a committed `package-lock.json` intermediate state.

- [ ] **Step 6: Update task state from planning to implementation**

Before editing package metadata, update `docs/todos/2026-06-16-lockfiles/todo.md` so its Sprint Contract covers implementation, not only planning. The updated contract must include:

- package-manager metadata changes
- committed `pnpm-lock.yaml`
- CI/publish workflow edits
- active documentation updates
- functional verification
- OSV, Semgrep, and final staged Gitleaks
- no remote writes or publishing

- [ ] **Step 7: Record baseline evidence**

Add a progress note to `docs/todos/2026-06-16-lockfiles/todo.md` with the command outputs from Steps 1-4, release-age evidence from Step 2, the confirmation from Step 5, and the task-state update from Step 6.

## Task 2: Add pnpm Workspace And Hardening Metadata

**Files:**
- Modify: `package.json`
- Modify: `website/package.json`
- Modify: `packages/mcp/package.json`
- Modify: `integrations/filesystem-watcher/package.json`
- Modify: `integrations/openclaw/package.json`
- Modify: `integrations/pi/package.json`
- Create: `pnpm-workspace.yaml`
- Modify: `.gitignore`
- Modify: `website/.gitignore`
- Modify: `docs/todos/2026-06-16-lockfiles/todo.md`

- [ ] **Step 1: Add the package-manager pin**

Modify every participating `package.json` so the top-level object contains this field near the existing package metadata:

```json
"packageManager": "pnpm@11.6.0"
```

Expected nearby root package metadata:

```json
{
  "name": "@agentmemory/agentmemory",
  "version": "0.9.27",
  "description": "Persistent memory for AI coding agents, powered by iii-engine's three primitives",
  "type": "module",
  "packageManager": "pnpm@11.6.0",
  "main": "dist/index.mjs"
}
```

- [ ] **Step 2: Keep npm overrides in root package metadata**

Keep the existing root `"overrides"` block for npm-based fallback behavior:

```json
"overrides": {
  "qs": "^6.15.2",
  "ws": "^8.21.0",
  "protobufjs": "^7.5.8"
}
```

Do not add a `"pnpm"` block to `package.json`; pnpm 11 reads these settings from `pnpm-workspace.yaml`.

- [ ] **Step 3: Use a workspace dependency for the MCP shim**

Modify `packages/mcp/package.json` so its dependency on the root package uses the workspace protocol:

```json
"dependencies": {
  "@agentmemory/agentmemory": "workspace:~"
}
```

This forces source installs to resolve the local workspace package instead of consulting the registry for the just-built root package. Because npm does not rewrite `workspace:` dependencies, Task 4 updates the MCP publish step to use pnpm publish.

- [ ] **Step 4: Create the workspace file**

Create `pnpm-workspace.yaml` with exactly:

```yaml
packages:
  - "."
  - "website"
  - "packages/*"
  - "integrations/filesystem-watcher"
  - "integrations/openclaw"
  - "integrations/pi"

linkWorkspacePackages: true
preferWorkspacePackages: true
savePrefix: ""
minimumReleaseAge: 1440
minimumReleaseAgeStrict: true
minimumReleaseAgeIgnoreMissingTime: false
blockExoticSubdeps: true
strictDepBuilds: true
dangerouslyAllowAllBuilds: false
trustPolicy: no-downgrade

overrides:
  qs: "^6.15.2"
  ws: "^8.21.0"
  protobufjs: "^7.5.8"
  postcss: "^8.5.10"
```

This keeps one committed `pnpm-lock.yaml` at the repository root, prefers local workspace packages during source installs, and keeps non-auth pnpm policy in the pnpm workspace config. Do not create or commit `.npmrc` in this task; user or registry auth config is outside the repository policy surface.

- [ ] **Step 5: Stop ignoring the canonical lockfile**

Update root `.gitignore` lockfile section to:

```gitignore
# Non-canonical package-manager lockfiles
package-lock.json
yarn.lock
```

Update `website/.gitignore` by removing only the `pnpm-lock.yaml` line. Leave `package-lock.json` and `yarn.lock` ignored there.

- [ ] **Step 6: Verify metadata edits**

Run:

```bash
jq -r '.packageManager' package.json website/package.json packages/mcp/package.json integrations/filesystem-watcher/package.json integrations/openclaw/package.json integrations/pi/package.json
```

Expected output:

```text
pnpm@11.6.0
pnpm@11.6.0
pnpm@11.6.0
pnpm@11.6.0
pnpm@11.6.0
pnpm@11.6.0
```

Run:

```bash
jq '.overrides' package.json
```

Expected output includes the existing npm security pins for `qs`, `ws`, and `protobufjs`.

Run:

```bash
jq -r '.dependencies["@agentmemory/agentmemory"]' packages/mcp/package.json
```

Expected output:

```text
workspace:~
```

Run:

```bash
rg -n 'linkWorkspacePackages|preferWorkspacePackages|savePrefix|minimumReleaseAge|minimumReleaseAgeStrict|minimumReleaseAgeIgnoreMissingTime|blockExoticSubdeps|strictDepBuilds|dangerouslyAllowAllBuilds|trustPolicy|overrides|postcss' pnpm-workspace.yaml
```

Run:

```bash
rg -n 'pnpm-lock.yaml' .gitignore website/.gitignore
```

Expected: no output.

- [ ] **Step 7: Record progress**

Update the task-state matrix in `docs/todos/2026-06-16-lockfiles/todo.md` to mark package-manager metadata as in progress, with command evidence from Step 6.

## Task 3: Generate And Review The pnpm Lockfile

**Files:**
- Create: `pnpm-lock.yaml`
- Modify: `docs/todos/2026-06-16-lockfiles/todo.md`

- [ ] **Step 1: Check credential boundary before install**

Run presence-only checks:

```bash
test -f "$HOME/.npmrc"
```

Expected outcomes:

```text
exit 0 means a user npm config exists; do not print it.
exit 1 means no user npm config exists.
```

If user-level npm config exists and private registry access or token exposure cannot be ruled out, stop and ask for current-turn approval before dependency resolution.

- [ ] **Step 2: Confirm Corepack resolves the pinned pnpm**

Run:

```bash
corepack pnpm --version
```

Expected:

```text
11.6.0
```

Do not run `corepack enable` locally as part of this task. It can mutate user-level shims outside the repository. CI may still run `corepack enable` because that state is ephemeral inside the runner.

- [ ] **Step 3: Generate the lockfile without installing packages**

Run from the repository root:

```bash
corepack pnpm install --lockfile-only --ignore-scripts
```

Expected:

```text
pnpm-lock.yaml is created at the repository root.
node_modules is not required for this step.
No lifecycle build approval is added automatically.
```

If pnpm fails because workspace hardening rejects a package, record the exact error and stop before changing hardening settings.

- [ ] **Step 4: Review lockfile scope**

Run:

```bash
node <<'NODE'
const fs = require("node:fs");
const lockfile = fs.readFileSync("pnpm-lock.yaml", "utf8");
const expected = [
  ".",
  "website",
  "packages/mcp",
  "integrations/filesystem-watcher",
  "integrations/openclaw",
  "integrations/pi",
];
const actual = [];
let inImporters = false;
for (const line of lockfile.split("\n")) {
  if (line === "importers:") {
    inImporters = true;
    continue;
  }
  if (!inImporters) continue;
  if (/^\S/.test(line)) break;
  const match = line.match(/^  ([^ ].*?)(?::|\: \{\})$/);
  if (match) actual.push(match[1]);
}
const missing = expected.filter((importer) => !actual.includes(importer));
const unexpected = actual.filter((importer) => !expected.includes(importer));
if (missing.length || unexpected.length) {
  console.error(JSON.stringify({ expected, actual, missing, unexpected }, null, 2));
  process.exit(1);
}
NODE
```

Expected: exits 0. This confirms the lockfile contains exactly the intended workspace package importers.

- [ ] **Step 5: Review dependency-surface changes**

Run:

```bash
git diff --stat -- package.json website/package.json packages/mcp/package.json integrations/filesystem-watcher/package.json integrations/openclaw/package.json integrations/pi/package.json pnpm-workspace.yaml pnpm-lock.yaml
```

Expected: `pnpm-lock.yaml`, all participating `package.json` files, and `pnpm-workspace.yaml` are the only dependency-surface files changed so far. `.npmrc` must not be created or modified.

- [ ] **Step 6: Record dependency-intake decision**

Update `docs/todos/2026-06-16-lockfiles/todo.md` with:

```markdown
## Dependency Intake

Decision: accept.
Need: committed lockfile for reproducible installs and supply-chain scans.
Standard-library alternative: none; lockfiles are package-manager metadata.
Source: npm registry via pnpm 11.6.0.
Release-age posture: `pnpm-workspace.yaml` enforces `minimumReleaseAge: 1440` and strict release-age behavior; `pnpm@11.6.0` satisfies the release-age policy based on npm publish time.
Maintainership: no new direct package is introduced by this task; existing dependencies are resolved into a lockfile.
Lifecycle scripts: generated with `--ignore-scripts`; any later build approval must be reviewed separately.
Lockfile churn: expected and task-owned for this migration.
Credential exposure: user npm config was not printed; private registry access requires approval if detected.
```

## Task 4: Update CI And Publish Workflows

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/publish.yml`
- Modify: `test/quality-gates.test.ts`
- Modify: `test/plugin-surface-contract.test.ts`
- Modify: `docs/todos/2026-06-16-lockfiles/todo.md`

- [ ] **Step 1: Update CI install steps**

In `.github/workflows/ci.yml`, replace:

```yaml
      # Two-step install: generate a lockfile in-runner with
      # --package-lock-only, then install from it with `npm ci`.
      # Lockfiles are gitignored at the repo level.
      - run: npm install --package-lock-only --legacy-peer-deps --no-audit --no-fund
      - run: npm ci --legacy-peer-deps --no-audit --no-fund
```

with:

```yaml
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
```

Then replace only CI script `run:` command values, preserving all existing job structure, matrix entries, and `if:` guards:

```yaml
      - run: npm run build
      - run: npm run skills:check
      - run: npm run lint
      - run: npm run coverage
      - run: npm test
```

with:

```yaml
      - run: pnpm run build
      - run: pnpm run skills:check
      - run: pnpm run lint
      - run: pnpm run coverage
      - run: pnpm test
```

- [ ] **Step 2: Update publish install and verification steps**

In `.github/workflows/publish.yml`, replace:

```yaml
      # Two-step install: generate a lockfile in-runner with
      # --package-lock-only, then install from it with `npm ci`. Gives a
      # single deterministic dep graph across build / test / publish
      # within one job — important because publish uses `--provenance`.
      # Lockfiles are gitignored at the repo level.
      - run: npm install --package-lock-only --legacy-peer-deps --no-audit --no-fund
      - run: npm ci --legacy-peer-deps --no-audit --no-fund
      - run: npm run build
      - run: npm test
```

with:

```yaml
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: pnpm test
      - run: npm pack --dry-run --json
      - working-directory: packages/mcp
        run: pnpm pack --dry-run --json
      - working-directory: integrations/filesystem-watcher
        run: npm pack --dry-run --json
```

Leave the existing `npm publish --provenance --access public` commands unchanged for the root package and filesystem watcher. Change only the `packages/mcp` publish command to:

```yaml
            pnpm publish --provenance --access public --no-git-checks
```

This keeps the published artifact npm-compatible while letting pnpm rewrite `workspace:~` to the published semver range during packaging.

- [ ] **Step 3: Update quality-gate tests**

Update `test/quality-gates.test.ts` so tests that assert required CI and publish workflow commands expect:

- Corepack plus `pnpm install --frozen-lockfile`
- `pnpm run lint`, `pnpm run coverage`, `pnpm test`, `pnpm run build`, and `pnpm run skills:check`
- the existing matrix `if:` guards still present for lint, coverage, and tests
- root and fs-watcher still using npm publish
- MCP shim using `pnpm pack --dry-run --json` and `pnpm publish --provenance --access public --no-git-checks`
- the MCP source package contract expecting `workspace:~`

- [ ] **Step 4: Search for stale workflow install logic**

Run:

```bash
rg -n 'package-lock-only|npm ci|npm run build|npm test|Lockfiles are gitignored' .github/workflows test/quality-gates.test.ts
```

Expected: no output for `package-lock-only`, `npm ci`, `npm run build`, `npm test`, and `Lockfiles are gitignored`; any remaining `npm view`, root/fs-watcher `npm pack --dry-run`, root/fs-watcher `npm publish`, MCP `pnpm pack --dry-run`, or MCP `pnpm publish` in publish jobs is allowed.

- [ ] **Step 5: Record progress**

Update `docs/todos/2026-06-16-lockfiles/todo.md` with workflow files changed and the `rg` evidence from Step 4.

## Task 5: Update Contributor Documentation

**Files:**
- Modify: `README.md`
- Modify: `website/README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `SECURITY.md`
- Modify: `AGENTS.md`
- Modify: `docs/recipes/fork-workflow.md`
- Modify: `scripts/skills/generate.ts`
- Modify: generated plugin skill reference files, only through `corepack pnpm run skills:gen`
- Modify: `docs/todos/2026-06-16-lockfiles/todo.md`

- [ ] **Step 1: Update source build instructions**

In `README.md`, replace the source build command:

```bash
npm install && npm run build && npm start
```

with:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm run build
corepack pnpm start
```

- [ ] **Step 2: Update development commands**

In the README development command block near the bottom, replace:

```text
npm run dev               # Hot reload
npm run build             # Production build
npm test                  # 1,423+ tests
npm run test:integration  # API tests (requires running services)
```

with:

```text
corepack pnpm run dev               # Hot reload
corepack pnpm run build             # Production build
corepack pnpm test                  # 1,423+ tests
corepack pnpm run test:integration  # API tests (requires running services)
```

- [ ] **Step 3: Keep end-user npm and npx install instructions**

Do not change README commands such as:

```bash
npm install -g @agentmemory/agentmemory
npx @agentmemory/agentmemory
npx -y @agentmemory/mcp
```

Those commands describe consumption from the npm registry, not source development in this fork.

- [ ] **Step 4: Update website local development**

In `website/README.md`, replace:

```bash
npm install
npm run dev
```

with:

```bash
cd ..
corepack pnpm install --frozen-lockfile
corepack pnpm --dir website run dev
```

- [ ] **Step 5: Update other active contributor guidance**

Update active source workflow references in `CONTRIBUTING.md`, `SECURITY.md`, `AGENTS.md`, and `docs/recipes/fork-workflow.md` so they use committed `pnpm-lock.yaml`, `corepack pnpm install --frozen-lockfile`, and pnpm script commands for contributor/source workflows. Preserve npm/npx commands when they describe published package consumption or npm registry publication.

- [ ] **Step 6: Update generated skill command text**

Update command text in `scripts/skills/generate.ts` from source-development npm commands to pnpm commands, then regenerate generated skill references:

```bash
corepack pnpm run skills:gen
```

Expected: generated plugin skill reference files update only where the generator text changed.

- [ ] **Step 7: Search for stale no-lockfile project truth**

Run:

```bash
rg -n 'no-lockfile|no lockfile|never commit lock|package-lock-only|npm ci|generated lockfile|Lockfiles are gitignored|pnpm-lock.yaml|npm install && npm run|npm run build|npm test' README.md website/README.md CONTRIBUTING.md SECURITY.md AGENTS.md docs/recipes scripts/skills/generate.ts plugin docs/adr .github .gitignore website/.gitignore test/quality-gates.test.ts
```

Expected:

```text
docs/adr/0005-use-committed-lockfiles-in-the-fork.md contains intentional historical context.
No active README, workflow, generator, plugin skill reference, test, or ignore rule says lockfiles are forbidden or source workflows use generated npm lockfiles.
```

Do not rewrite historical `docs/todos/**`, changelog, or release-note records from earlier tasks. They are task-local history, not current project policy.

## Task 6: Run Functional Verification

**Files:**
- Modify: `docs/todos/2026-06-16-lockfiles/todo.md`
- Modify: `website/next.config.ts`

- [ ] **Step 1: Install from the committed lockfile**

Run:

```bash
corepack pnpm install --frozen-lockfile
```

Expected: exits 0 and uses `pnpm-lock.yaml`.

If `strictDepBuilds: true` blocks install-time scripts, run the package-manager diagnostic command shown by pnpm, record the packages requesting build approval, and stop. Do not approve builds automatically.

- [ ] **Step 2: Run core project verification**

Run:

```bash
corepack pnpm run build
```

Expected: exits 0.

Run:

```bash
corepack pnpm run skills:check
```

Expected: exits 0.

Run:

```bash
corepack pnpm run lint
```

Expected: exits 0.

Run:

```bash
corepack pnpm test
```

Expected: exits 0.

- [ ] **Step 3: Run coverage gate**

Run:

```bash
corepack pnpm run coverage
```

Expected: exits 0 and writes `coverage/`, which remains ignored.

- [ ] **Step 4: Run website build**

Run:

```bash
corepack pnpm --dir website run build
```

Expected: exits 0.

If Next/Turbopack cannot resolve `next/package.json` from the app directory under pnpm's workspace symlink layout, set `website/next.config.ts` `turbopack.root` to the repository workspace root and rerun this step.

- [ ] **Step 5: Run focused workflow test**

Run:

```bash
corepack pnpm test -- test/quality-gates.test.ts
```

Expected: exits 0 and confirms workflow command expectations were updated consistently.

- [ ] **Step 6: Verify npm package contents still package correctly**

Run:

```bash
npm pack --dry-run --json
corepack pnpm --dir packages/mcp pack --dry-run --json
npm --prefix integrations/filesystem-watcher pack --dry-run --json
```

Expected: each command exits 0. Inspect the JSON file lists and confirm they do not include `package-lock.json`, `.npmrc`, or unintended workspace-only files. For the MCP shim, confirm the packed manifest rewrites `workspace:~` to a normal semver dependency range. `pnpm-lock.yaml` may remain a source-repo artifact and should not be added to package tarballs unless the existing npm packaging rules include it intentionally.

- [ ] **Step 7: Record functional verification**

Update `docs/todos/2026-06-16-lockfiles/todo.md` with each command, outcome, and any blocker.

## Task 7: Run Security And Supply-Chain Gates

**Files:**
- Modify: `docs/todos/2026-06-16-lockfiles/todo.md`

- [ ] **Step 1: Run OSV on the source tree**

Run:

```bash
osv-scanner scan source .
```

Expected: exits 0 and scans `pnpm-lock.yaml`.

- [ ] **Step 2: Run Semgrep**

Run:

```bash
semgrep scan --config p/default --error --metrics=off .
```

Expected: exits 0.

- [ ] **Step 3: Check formatting**

Run:

```bash
git diff --check
```

Expected: exits 0.

- [ ] **Step 4: Record security verification**

Update the Feature / Verification Matrix in `docs/todos/2026-06-16-lockfiles/todo.md` with OSV, Semgrep, and `git diff --check` outcomes. Do not record Gitleaks yet; the staged secret scan runs after final task notes are staged in Task 8.

## Task 8: Final Review And Commit

**Files:**
- Modify: `docs/todos/2026-06-16-lockfiles/todo.md`

- [ ] **Step 1: Finalize task notes**

Update `docs/todos/2026-06-16-lockfiles/todo.md` final review notes with:

```markdown
- Committed lockfile policy implemented for the fork.
- pnpm version pinned in all participating `package.json` files.
- CI and publish workflows install from `pnpm-lock.yaml`.
- Functional verification results.
- Security gate results.
- Any residual risks or explicit user-accepted blockers.
```

- [ ] **Step 2: Stage intended files**

Run:

```bash
git add package.json website/package.json packages/mcp/package.json integrations/filesystem-watcher/package.json integrations/openclaw/package.json integrations/pi/package.json pnpm-workspace.yaml pnpm-lock.yaml .gitignore website/.gitignore .github/workflows/ci.yml .github/workflows/publish.yml README.md website/README.md website/next.config.ts CONTRIBUTING.md SECURITY.md AGENTS.md docs/recipes/fork-workflow.md scripts/skills/generate.ts plugin/skills docs/adr/0005-use-committed-lockfiles-in-the-fork.md docs/adr/README.md docs/todos/2026-06-16-lockfiles/todo.md docs/todos/2026-06-16-lockfiles/plan.md test/quality-gates.test.ts test/plugin-surface-contract.test.ts
```

Expected: exits 0. If generated skill reference files live outside `plugin/`, stage the exact generated paths shown by `git status -sb` after `corepack pnpm run skills:gen`.

- [ ] **Step 3: Review final staged diff**

Run:

```bash
git diff --cached --stat
```

Expected staged files:

```text
.github/workflows/ci.yml
.github/workflows/publish.yml
.gitignore
AGENTS.md
CONTRIBUTING.md
README.md
SECURITY.md
docs/adr/0005-use-committed-lockfiles-in-the-fork.md
docs/adr/README.md
docs/recipes/fork-workflow.md
docs/todos/2026-06-16-lockfiles/plan.md
docs/todos/2026-06-16-lockfiles/todo.md
integrations/filesystem-watcher/package.json
integrations/openclaw/package.json
integrations/pi/package.json
packages/mcp/package.json
package.json
plugin/skills/...
pnpm-lock.yaml
pnpm-workspace.yaml
scripts/skills/generate.ts
test/plugin-surface-contract.test.ts
test/quality-gates.test.ts
website/.gitignore
website/next.config.ts
website/README.md
website/package.json
```

- [ ] **Step 4: Confirm no non-canonical lockfiles are staged**

Run:

```bash
git diff --cached --name-only
```

Expected: includes `pnpm-lock.yaml`; does not include `package-lock.json` or `yarn.lock`.

If `package-lock.json` appears, stop and remove it from the intended change set before committing. It is not part of this migration.

- [ ] **Step 5: Run final staged secret scan**

Run:

```bash
gitleaks protect --staged --redact
```

Expected: exits 0. This must be the last mandatory pre-commit gate after all intended files, including final task notes, are staged.

- [ ] **Step 6: Record final Gitleaks result**

Update `docs/todos/2026-06-16-lockfiles/todo.md` with the Gitleaks result, stage the task note again, and rerun the staged secret scan:

Run:

```bash
git add docs/todos/2026-06-16-lockfiles/todo.md
gitleaks protect --staged --redact
```

Expected: exits 0.

- [ ] **Step 7: Commit**

Run:

```bash
git commit -m "chore: adopt committed pnpm lockfile policy"
```

Expected: commit succeeds.

## Plan Self-Review

- Spec coverage: ADR 5 is implemented by Tasks 2-5; pnpm migration and lockfile generation happen in one change set; CI/publish migration is Task 4; verification and security gates are Tasks 6-7.
- Marker scan: no task uses unresolved marker strings or dummy paths.
- Scope check: this is one package-manager migration across the existing JS/TS package surfaces; no source-code behavior changes are included.
- Boundary check: dependency resolution is gated by the credential-boundary check; local Corepack usage avoids user-level shim mutation; CI may use `corepack enable` only in ephemeral runners; npm publication remains unchanged.
