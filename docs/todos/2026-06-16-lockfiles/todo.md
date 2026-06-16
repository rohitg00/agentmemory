# Lockfile Adoption Task

Task id: `2026-06-16-lockfiles`

## Scope

Plan and implement the introduction of committed pnpm lockfiles for this fork, including the durable fork-only policy ADR, package-manager metadata, CI/publish workflows, active contributor documentation, and verification gates.

## Sprint Contract

Goal: move this fork from generated, ignored npm lockfiles to a committed `pnpm-lock.yaml` that supports reproducible installs and supply-chain scanning.

Scope:
- Record the lockfile policy decision in `docs/adr/` using `adr-tools`.
- Maintain an implementation plan under this task record.
- Pin pnpm in every participating `package.json`.
- Add a root `pnpm-workspace.yaml` with the workspace shape and pnpm hardening policy.
- Generate and commit the canonical root `pnpm-lock.yaml`.
- Update CI and publish workflows to install from the committed lockfile while preserving npm-compatible publication; use pnpm publish only where workspace dependency rewriting is required.
- Update active contributor/source workflow guidance and generated skill references.
- Run functional, packaging, and security verification.

Non-goals:
- No committed `package-lock.json` or `yarn.lock`.
- No weakening pnpm hardening settings without a recorded blocker and explicit user decision.
- No automatic dependency build approvals.
- No source behavior changes beyond package-manager/workflow/documentation surfaces required for the migration.
- No remote writes, publishing, or branch integration.

Acceptance criteria:
- A new ADR records that this fork intentionally uses committed lockfiles.
- The plan treats pnpm migration and lockfile introduction as one verified change set, with no committed `package-lock.json` intermediate state.
- Every participating `package.json` pins the same pnpm version.
- The repository has one committed root `pnpm-lock.yaml` and does not ignore it.
- CI and publish workflows install from `pnpm-lock.yaml` with `pnpm install --frozen-lockfile`.
- Active contributor/source docs no longer describe generated npm lockfiles or npm source workflows, while end-user npm/npx commands remain intact.
- Functional checks, package dry-runs, OSV, Semgrep, and final staged Gitleaks either pass or have recorded current-turn accepted blockers.

Intended verification:
- `/Users/A1538552/_projects/_tools/adr-tools/src/adr list`
- `/Users/A1538552/_projects/_tools/adr-tools/src/adr generate toc`
- `corepack pnpm --version`
- `corepack pnpm install --lockfile-only --ignore-scripts`
- `corepack pnpm install --frozen-lockfile`
- `corepack pnpm run build`
- `corepack pnpm run skills:check`
- `corepack pnpm run lint`
- `corepack pnpm test`
- `corepack pnpm run coverage`
- `corepack pnpm --dir website run build`
- `corepack pnpm test -- test/quality-gates.test.ts`
- `npm pack --dry-run --json`
- `corepack pnpm --dir packages/mcp pack --dry-run --json`
- `npm --prefix integrations/filesystem-watcher pack --dry-run --json`
- `osv-scanner scan source .`
- `semgrep scan --config p/default --error --metrics=off .`
- `git diff --check`
- `gitleaks protect --staged --redact`

Known boundaries:
- Dependency resolution may access package registries. A user-level npm config exists on this machine; do not print it and ask for explicit current-turn approval before dependency resolution if private registry access or credential exposure cannot be ruled out.
- pnpm build approvals are not automatic. If `strictDepBuilds` blocks install-time scripts, stop and record the packages requesting approval.
- CI and local source workflows move to pnpm, but npm publication and end-user npm/npx install commands remain supported.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Task-state record created | File inspection | Done | This file records scope, contract, matrix, and progress. |
| ADR recorded | `adr list`, ADR TOC | Done | `adr list` includes `docs/adr/0005-use-committed-lockfiles-in-the-fork.md`; `docs/adr/README.md` links ADR 5. |
| Implementation plan written | Plan self-review | Done | `docs/todos/2026-06-16-lockfiles/plan.md` contains the follow-up implementation plan and self-review; it explicitly combines pnpm adoption with committed `pnpm-lock.yaml` generation. |
| Documentation verification | `git diff --check`, targeted `rg` | Done | `git diff --check` passed; `adr generate toc` output includes ADR 5; targeted marker search found no unresolved ADR/template stub text after final cleanup. |
| Pre-implementation plan review | Four read-only reviewer workstreams | Done | Findings accepted into `plan.md`: all participating manifests get `packageManager`, pnpm hardening goes in `pnpm-workspace.yaml`, `pnpm@11.6.0` satisfies release-age policy, active docs/tests are in scope, and final staged Gitleaks runs after final task notes are staged. |
| Package-manager metadata | `jq`, `rg`, exact file inspection | Done | Six participating manifests report `pnpm@11.6.0`; `package.json` keeps npm overrides for `qs`, `ws`, and `protobufjs`; `pnpm-workspace.yaml` contains workspace linking, pnpm overrides, and required hardening settings; `.npmrc` is absent; `pnpm-lock.yaml` no longer appears in `.gitignore` or `website/.gitignore`. |
| Lockfile generation | `corepack pnpm install --lockfile-only --ignore-scripts`, exact importer check | Done | Lockfile generation passed with pnpm 11.6.0 after `packages/mcp` moved to `workspace:~`; exact importer check found `.`, `website`, `packages/mcp`, `integrations/filesystem-watcher`, `integrations/openclaw`, and `integrations/pi`. |
| Workflow/docs migration | targeted `rg`, `test/quality-gates.test.ts`, generated skill check | Done | Stale source-workflow scan found only expected historical ADR/negative-test/fixture references; `corepack pnpm run skills:check` passed; `corepack pnpm exec vitest run test/quality-gates.test.ts test/plugin-surface-contract.test.ts` passed. |
| Functional and packaging verification | pnpm build/test/coverage/website checks, npm dry-runs, and pnpm MCP dry-run | Done | `corepack pnpm install --frozen-lockfile --ignore-scripts`, build, lint, full test, coverage, website build, and package dry-runs passed. Normal install without `--ignore-scripts` was not approved by the sandbox reviewer due lifecycle-script credential risk. |
| Security verification | OSV, Semgrep, `git diff --check`, final staged Gitleaks | Done with accepted OSV risk | `semgrep scan --config p/default --error --metrics=off .`, `git diff --check`, and `gitleaks protect --staged --redact` passed. `osv-scanner scan source .` found GHSA-8988-4f7v-96qf in transitive `@opentelemetry/core@1.30.1` from `iii-sdk@0.11.2`; user accepted this existing transitive risk as a known blocker to track upstream rather than force an unsafe override. |

## Progress Notes

- 2026-06-16: User asked for a plan to introduce lockfiles and an ADR making clear that this fork wants to use lockfiles.
- 2026-06-16: Baseline worktree `/Users/A1538552/.codex/worktrees/4fa9/agentmemory` on branch `lockfile`; `git status -sb` returned `## lockfile`.
- 2026-06-16: Existing evidence shows `.gitignore` and `website/.gitignore` ignore all JS lockfiles, CI/Publish generate temporary npm lockfiles with `npm install --package-lock-only` before `npm ci`, and prior task notes treat missing lockfiles as intentional.
- 2026-06-16: Created ADR 5 with `/Users/A1538552/_projects/_tools/adr-tools/src/adr new "Use committed lockfiles in the fork"` and wrote the fork-only committed-lockfile decision.
- 2026-06-16: Wrote `docs/todos/2026-06-16-lockfiles/plan.md` with a pnpm-based migration plan, including package metadata, `pnpm-lock.yaml`, CI/publish workflow changes, docs updates, OSV, Semgrep, and Gitleaks verification.
- 2026-06-16: Initial planning verification passed: `adr list` includes ADR 5, `adr generate toc` output includes ADR 5, and `git diff --check` passed.
- 2026-06-16: User confirmed pnpm migration should be considered in the same move; updated ADR 5 and the implementation plan to make the migration a single verified change set with no committed `package-lock.json` intermediate state.
- 2026-06-16: `/review-and-implement` invoked for `docs/todos/2026-06-16-lockfiles/plan.md`. Current worktree is `/Users/A1538552/.codex/worktrees/4fa9/agentmemory` on branch `lockfile`; only task-owned planning docs are modified or untracked before implementation.
- 2026-06-16: Pre-implementation review found the initial plan needed corrections: pin all participating manifests, use `pnpm-workspace.yaml` for pnpm policy instead of `.npmrc`, avoid local `corepack enable`, pin `pnpm@11.6.0` because `11.7.0` is too new for the 1440-minute release-age policy, expand active docs/tests coverage, add npm package dry-runs, and run staged Gitleaks after final task notes are staged.
- 2026-06-16: Package-manager metadata updated and verified. Commands confirmed six `packageManager` pins to `pnpm@11.6.0`, required `pnpm-workspace.yaml` hardening settings, absence of `.npmrc`, and no remaining `pnpm-lock.yaml` ignore rule in root or website ignore files.
- 2026-06-16: First `corepack pnpm install --lockfile-only --ignore-scripts` attempt stopped before creating a lockfile. pnpm 11 warned that the `pnpm` field in `package.json` is ignored, and `trustPolicy: no-downgrade` blocked registry resolution of `@agentmemory/agentmemory@0.9.27` for the MCP shim. Changed next approach: move pnpm overrides into `pnpm-workspace.yaml` and enable workspace linking so package shims resolve local workspace packages during source installs.
- 2026-06-16: Second lockfile attempt still resolved `packages/mcp`'s `@agentmemory/agentmemory` dependency from the registry and hit the same `ERR_PNPM_TRUST_DOWNGRADE`. Changed next approach before a third retry: add `preferWorkspacePackages: true` alongside `linkWorkspacePackages: true`.
- 2026-06-16: Third lockfile attempt still hit the same trust downgrade, confirming that the MCP shim's semver dependency was still a registry dependency. User approved extending publish behavior. Changed next approach: set `packages/mcp` to `workspace:~` and publish/pack that shim with pnpm so the published npm artifact gets a rewritten semver dependency.
- 2026-06-16: Lockfile generation passed after the MCP shim dependency changed to `workspace:~`. `pnpm-lock.yaml` records all six workspace importers and links `packages/mcp` to the root package with `link:../..`.
- 2026-06-16: Functional verification passed: `corepack pnpm run build`, `corepack pnpm run skills:check`, `corepack pnpm run lint`, `corepack pnpm exec vitest run test/quality-gates.test.ts test/plugin-surface-contract.test.ts`, `corepack pnpm test`, `corepack pnpm run coverage`, and `corepack pnpm --dir website run build`.
- 2026-06-16: Website build initially failed because `turbopack.root` was set to `website/` while pnpm symlinked `next` under the workspace root. Updated `website/next.config.ts` to use the workspace root; rerun passed.
- 2026-06-16: Package verification passed: root `npm pack --dry-run --json` produced 165 files, fs-watcher `npm pack --dry-run --json` produced 4 files, and MCP `pnpm pack` produced 4 files with packed dependency rewritten from `workspace:~` to `~0.9.27`.
- 2026-06-16: Security verification is blocked by OSV finding GHSA-8988-4f7v-96qf in `@opentelemetry/core@1.30.1`, introduced through `iii-sdk@0.11.2`. Semgrep and `git diff --check` passed.
- 2026-06-16: User accepted GHSA-8988-4f7v-96qf as a known transitive `iii-sdk`/OpenTelemetry risk for this lockfile migration after analysis showed the supported fix requires upstream `iii-sdk`/observability support for OpenTelemetry 2.x; even latest inspected `iii-sdk` still depends on OpenTelemetry 1.x.
- 2026-06-16: Final staged secret scan passed with `gitleaks protect --staged --redact`: no leaks found.

## Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output | Result | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Pre-implementation review: plan/ADR alignment | `docs/todos/2026-06-16-lockfiles/plan.md`, ADR 5, repo package/workflow context | No | High/Medium findings or `ACCEPT` | Found ADR/plan mismatch on `packageManager` coverage and lockfile importer verification looseness. | Findings accepted; plan now pins all participating manifests and checks exact importer set. |
| Pre-implementation review: architecture/integration | pnpm workspace, package surfaces, CI/publish integration | No | High/Medium findings or `ACCEPT` | Found package-manager pin mismatch and missing npm publish/package dry-run coverage. | Findings accepted; plan keeps npm publish but verifies npm package dry-runs. |
| Pre-implementation review: verification/security | verification commands, dependency gates, OSV/Semgrep/Gitleaks coverage | No | High/Medium findings or `ACCEPT` | Found Gitleaks ordering gap, pnpm release-age issue, and `.npmrc` hardening ambiguity. | Findings accepted; plan uses `pnpm@11.6.0`, `pnpm-workspace.yaml`, and final staged Gitleaks after final notes. |
| Pre-implementation review: scope/minimality | scope creep, unnecessary work, fork/upstream boundary | No | High/Medium findings or `ACCEPT` | Found under-scoped active docs/tests and local `corepack enable` side effect. | Findings accepted; plan expands active docs/tests and avoids local `corepack enable`. |

## Pre-Implementation Review Triage

| Finding | Decision | Plan change |
| --- | --- | --- |
| ADR says participating package manifests pin `packageManager`, but plan only pinned root. | Accept | Task 2 now pins root, website, package shim, and integration manifests. |
| pnpm settings were planned in `.npmrc`, but current pnpm policy settings are workspace YAML settings. | Accept | Task 2 now puts hardening settings in `pnpm-workspace.yaml`; `.npmrc` is not committed. |
| `pnpm@11.7.0` was too recent for the 1440-minute release-age policy on 2026-06-16. | Accept | Plan pins `pnpm@11.6.0` and records release-age evidence. |
| Gitleaks would have run before final task-note staging. | Accept | Task 8 now runs staged Gitleaks after all intended files and final notes are staged, then reruns after recording the result. |
| Active docs, generated skill references, and workflow tests were under-scoped. | Accept | Tasks 4-5 now include `test/quality-gates.test.ts`, active contributor docs, generator text, and generated skill references. |
| Local `corepack enable` mutates outside the repository. | Accept | Local steps use `corepack pnpm`; only ephemeral CI runners use `corepack enable`. |

## Current Review Notes

- Created ADR 5 to record the fork-only decision to use committed lockfiles.
- Updated `docs/adr/README.md` to include ADR 5.
- Created the lockfile adoption implementation plan at `docs/todos/2026-06-16-lockfiles/plan.md`.
- Updated the plan to make pnpm adoption and committed `pnpm-lock.yaml` introduction one combined migration.
- Pre-implementation review corrections have been folded into the plan before package/workflow edits.
- Implementation generated `pnpm-lock.yaml`, migrated package/workflow/docs surfaces to pnpm source workflows, and extended MCP publishing to pnpm so `workspace:~` dependencies are rewritten for npm consumers.
- Functional verification passed, including build, lint, full test, coverage, website build, generated skill check, and package dry-runs.
- Security verification has one accepted residual risk: OSV reports GHSA-8988-4f7v-96qf in transitive `@opentelemetry/core@1.30.1` through the existing `iii-sdk@0.11.2` pin. User accepted tracking this upstream instead of forcing an out-of-range OpenTelemetry override. Final staged Gitleaks passed.
