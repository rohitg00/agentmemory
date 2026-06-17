# Issue 171 Anthropic Dependencies

Task id: `2026-06-17-issue-171-anthropic-deps`

## Scope

- Repository: `/Users/A1538552/.codex/worktrees/722d/agentmemory`
- Branch: `github-pr/issue-171-anthropic-deps-fe927dc2`
- Owning scope: root npm package install behavior, provider implementation, package metadata, lockfile, and package/security documentation.
- Source issue: local GitHub issue #171, mirrored from upstream `rohitg00/agentmemory#430`, title `npm installs anthropic dependencies`.

## Sprint Contract

Goal: make normal npm installs of `@agentmemory/agentmemory` stop automatically installing Anthropic SDK packages while preserving the Anthropic API provider and keeping the Claude Agent SDK fallback opt-in.

Scope:
- Replace the direct `@anthropic-ai/sdk` runtime dependency with a raw-fetch Anthropic Messages API provider that matches the existing provider contract.
- Change `@anthropic-ai/claude-agent-sdk` from an auto-installed runtime dependency to an optional peer used only when `AGENTMEMORY_ALLOW_AGENT_SDK=true`.
- Update tests, package metadata, lockfile, and docs that describe runtime dependency posture.
- Run targeted functional, package, and required supply-chain/security checks where available.
- Prepare the local branch for a GitHub PR without fetch, push, PR creation, publish, deploy, or destructive cleanup.

Non-goals:
- No removal of Anthropic API provider support.
- No removal of the Claude Agent SDK fallback feature; users who opt in must get a clear install instruction if the peer package is absent.
- No version bump unless required by release policy.
- No remote-state changes: no fetch, pull, push, PR creation, PR merge, publish, or deploy.
- No broad dependency refresh beyond lockfile changes caused by removing Anthropic auto-install dependencies.

Acceptance criteria:
- Root `package.json` no longer lists `@anthropic-ai/sdk` or `@anthropic-ai/claude-agent-sdk` under normal `dependencies`.
- `@anthropic-ai/claude-agent-sdk` is represented as an optional peer, so npm does not install it automatically for users who do not opt into the fallback.
- Anthropic provider tests prove raw-fetch request shape for `compress`, `summarize`, image description, custom base URL, and error handling.
- Agent SDK provider tests prove a missing peer produces a clear opt-in install error.
- Package/quality tests prove no auto-installed Anthropic package remains in the root runtime dependency set.
- `pnpm-lock.yaml` reflects the package metadata change without unrelated dependency churn.
- Required dependency intake, OSV, Semgrep, and Gitleaks outcomes are recorded before final handoff or any commit.

Intended verification:
- `corepack pnpm install --lockfile-only --ignore-scripts`
- `corepack pnpm install --frozen-lockfile --ignore-scripts`
- `corepack pnpm exec vitest run test/compress-model.test.ts test/agent-sdk-provider.test.ts test/fetch-timeout.test.ts test/quality-gates.test.ts test/build-package-contract.test.ts`
- `corepack pnpm run build`
- `corepack pnpm run lint`
- `npm pack --dry-run --json`
- Consumer install smoke from the packed root tarball with `npm install --package-lock-only --ignore-scripts <tarball>`, then inspect `package-lock.json` for absent Anthropic packages.
- `corepack pnpm --dir packages/mcp pack --dry-run --json`
- `osv-scanner scan source .`
- `semgrep scan --config p/default --error --metrics=off .`
- `git diff --check`
- `gitleaks protect --staged --redact`

Known boundaries:
- This intentionally changes published package install behavior and dependency metadata to satisfy issue #171. The user delegated this fix if validation remained `fix needed`; no remote write or publication is authorized.
- `@anthropic-ai/sdk` removal is a dependency removal, not a replacement dependency. Anthropic API calls use Node 22 global `fetch` through the existing `fetchWithTimeout` helper.
- `@anthropic-ai/claude-agent-sdk` becomes user-installed only when the opt-in fallback is configured.
- `origin/main` freshness is not authorized for fetch; GitHub push prep must use existing local `origin/main` only if present and report freshness as unverified.

Stop conditions:
- A required fix would remove Anthropic provider support or the agent-sdk fallback entirely.
- A package-manager hardening gate requires lifecycle-script approval, private registry access, or credential exposure.
- Required OSV, Semgrep, or Gitleaks checks fail without a fix or current-turn accepted risk.
- A step requires fetch, pull, push, PR creation, publish, deploy, destructive cleanup, rebase, force-push, or unrelated staging.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Validate issue #171 | Read-only subagent and local/package evidence | Done | Subagent `Faraday` returned `fix needed`; `package.json` and `pnpm-lock.yaml` currently show Anthropic packages as runtime deps. |
| Task state and plan | File inspection | Done | This task record and `plan.md` updated with review findings, verification evidence, and final prep notes. |
| Remove Anthropic auto-install deps | Package metadata, lockfile, package tests, pack dry-run, consumer install smoke | Done | `package.json` has only optional peer metadata for `@anthropic-ai/claude-agent-sdk`; `pnpm-lock.yaml` has no `@anthropic-ai/*` entries; package dry-runs passed; consumer package-lock smoke produced no Anthropic package entries. |
| Preserve Anthropic provider behavior | Targeted provider tests and build | Done | `corepack pnpm exec vitest run test/compress-model.test.ts test/agent-sdk-provider.test.ts test/fetch-timeout.test.ts test/quality-gates.test.ts test/build-package-contract.test.ts`: 5 files / 59 tests passed; `corepack pnpm run build` passed. |
| Preserve agent-sdk opt-in behavior | Targeted provider tests | Done | `test/agent-sdk-provider.test.ts` passed and covers injected SDK loader, recursion guard, and missing optional peer error. |
| Supply-chain/security gates | OSV, Semgrep, staged Gitleaks | Done | `osv-scanner scan source .` passed with the existing GHSA-8988-4f7v-96qf waiver and no unfiltered issues; `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings; `gitleaks protect --staged --redact` passed with no leaks. |
| GitHub PR local prep | `github-push-prepare` local-only flow | In progress | Preflight, local base capture, hook/signing inspection, scoped staging, staged patch inspection, and staged Gitleaks completed. Commit and base integration pending. |

## Dependency Intake

Decision: `reject` new dependency. Use existing Node 22 `fetch` and the local `fetchWithTimeout` helper instead of replacing `@anthropic-ai/sdk` with another client.

Decision: `remove` direct `@anthropic-ai/sdk`. Need: avoid auto-installing Anthropic packages; standard-library alternative: global `fetch`; source/maintainership/lifecycle no longer applicable after removal; lockfile churn should remove package and transitive-only entries not used elsewhere.

Decision: `move` `@anthropic-ai/claude-agent-sdk` to optional peer. Need: preserve opt-in Claude subscription fallback without automatic install; source remains the existing Anthropic package; no lifecycle approval change is intended; users who opt in install it explicitly.

Decision: `accept` explicit `autoInstallPeers: false` in `pnpm-workspace.yaml`. Need: pnpm otherwise auto-installs optional peers into the source lockfile, contradicting the optional-peer install behavior being fixed. Standard-library alternative does not apply; this is package-manager metadata, not a new package. Release-age and maintainership do not apply. Lifecycle posture is improved because the optional peer and its platform optional packages leave the normal source install graph. Credential exposure is unchanged; verification used public package metadata without printing package-manager auth config.

Dependency-intake detail:
- Exact existing root specifier: `@anthropic-ai/claude-agent-sdk@^0.3.142`; current lockfile resolution: `0.3.177`.
- Current peer requirement from that package: `@anthropic-ai/sdk >=0.93.0`, `@modelcontextprotocol/sdk ^1.29.0`, and `zod ^4.0.0`; current lockfile also records platform-specific optional packages for darwin/linux/win32.
- Release-age posture: no newly added direct dependency; the existing package moves out of automatic install surfaces. If the optional peer range remains `^0.3.142`, the package remains user-resolved at opt-in time instead of lockfile-installed for all users.
- Lifecycle scripts: no build approval is added. Moving the package to optional peer should remove its platform optional package churn from normal source/runtime install graphs.
- Credential/private registry exposure: root package and optional peer are public npm packages. Verification dependency resolution must not print token-bearing package-manager config.
- Type strategy: do not add the SDK as a devDependency. Remove compile-time module resolution by using a local structural type and injected/default dynamic loader in `src/providers/agent-sdk.ts`.
- Lockfile churn expectation: remove root importer normal dependency entries for both Anthropic packages; retain only optional peer metadata if pnpm records it.

## Pre-Implementation Review Triage

| Finding | Decision | Plan change |
| --- | --- | --- |
| Missing planned Anthropic error test. | Accept | Task 1 now includes a non-OK response test. |
| Package guard did not cover optional/bundled install surfaces. | Accept | Task 3 now checks `dependencies`, `optionalDependencies`, `bundledDependencies`, and `bundleDependencies`. |
| Optional peer plan lacked source-build type strategy. | Accept | Plan now uses local structural SDK types and injected/default dynamic loader; no devDependency. |
| `tsdown.config.ts` stale `@anthropic-ai/sdk` external entry was not explicit. | Accept | `tsdown.config.ts` is now a planned touched file and included in stale-reference scan. |
| Verification did not prove fresh frozen install after lockfile update. | Accept | Plan and intended verification now include `corepack pnpm install --frozen-lockfile --ignore-scripts`. |
| Pack dry-run alone does not prove npm resolver behavior. | Accept | Plan now includes a temp consumer package-lock smoke from the packed tarball. |
| Dependency intake for optional peer was too thin. | Accept | Intake now records existing range/resolution, release-age posture, lifecycle and credential posture, type strategy, and lockfile expectations. |
| Manual staging/commit happened before `github-push-prepare`. | Accept | Plan now delegates staging, staged Gitleaks, commit discipline, and local PR-prep handoff to `github-push-prepare`. |
| Raw-fetch Anthropic provider lacked timeout acceptance coverage. | Accept | Plan now adds `test/fetch-timeout.test.ts` coverage and includes it in targeted/final Vitest commands. |

## Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output | Result | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Issue validation | Package metadata, lockfile, install behavior evidence | No | Verdict: `close`, `already fixed`, `fix needed`, or `needs approval/defer` | `fix needed`; normal install still pulls Anthropic packages. | Did not run actual npm install; metadata evidence is authoritative for install dependencies. |
| Pre-implementation review: acceptance coverage | Plan/task record | No | High/Medium findings or `ACCEPT` | Found missing error test, narrow package guard, and missing SDK type strategy. | Findings accepted into plan before implementation. |
| Pre-implementation review: architecture/integration | Plan/task record and provider/package surfaces | No | High/Medium findings or `ACCEPT` | Found missing SDK type strategy and stale `tsdown.config.ts` handling. | Findings accepted into plan before implementation. |
| Pre-implementation review: verification/security | Plan/task record and package/security gates | No | High/Medium findings or `ACCEPT` | Found missing frozen install proof, missing consumer-install smoke, and thin dependency intake. | Findings accepted into plan before implementation. |
| Pre-implementation review: scope/boundaries | Plan/task record and GitHub flow boundaries | No | High/Medium findings or `ACCEPT` | Found manual staging/commit before `github-push-prepare`. | Findings accepted into plan before implementation. |
| Second-round pre-implementation review | Updated plan/task record | No | New unresolved High/Medium findings or `ACCEPT` | Found missing timeout acceptance coverage for the new raw-fetch Anthropic provider. | Finding accepted into plan before implementation. |
| Final test coverage review | Stable task diff | No | High/Medium findings or `ACCEPT` | Found Anthropic tests did not assert enough request shape. | Fixed by asserting URL, method, headers, request body, model selection, and image content. |
| Final security review | Stable task diff | No | High/Medium findings or `ACCEPT` | Found raw Anthropic error handling echoed upstream response body. | Fixed by throwing only `Anthropic API error (<status>)` and adding a regression assertion that body text is not leaked. |
| Final maintainability review | Stable task diff | No | High/Medium findings or `ACCEPT` | `ACCEPT`. | No unresolved maintainability risk reported. |

## Progress Notes

- 2026-06-17: Read active repo instructions, confirmed clean detached worktree with `git status -sb --untracked-files=all`.
- 2026-06-17: Created local branch `github-pr/issue-171-anthropic-deps-fe927dc2` from `fe927dc2` because GitHub push prep requires a named branch before local prep work.
- 2026-06-17: Public upstream issue `rohitg00/agentmemory#430` confirms original report was `@agentmemory/agentmemory@0.9.16` installing `@anthropic-ai/sdk@^0.39.0` and `@anthropic-ai/claude-agent-sdk@^0.3.142` with a peer conflict. Current local package metadata fixes the peer conflict with `@anthropic-ai/sdk@^0.100.1` but still auto-installs both Anthropic packages.
- 2026-06-17: Implemented raw-fetch Anthropic provider via `fetchWithTimeout`, moved Claude Agent SDK to an optional peer with local structural types, disabled pnpm peer auto-installing for the workspace, and updated active docs for the explicit SDK install step.
- 2026-06-17: Initial `corepack pnpm exec vitest ...` red-phase attempt was blocked before Vitest by pnpm ignored-build hardening during dependency materialization. Followed repo instruction by running `corepack pnpm install --frozen-lockfile --ignore-scripts`; subsequent focused tests passed.
- 2026-06-17: Verification evidence so far: `corepack pnpm install --lockfile-only --ignore-scripts` passed; `corepack pnpm install --frozen-lockfile --ignore-scripts` passed and removed `@anthropic-ai/claude-agent-sdk` from the installed graph; focused Vitest passed 5 files / 59 tests; `corepack pnpm run build` passed; `corepack pnpm run lint` passed; root and MCP package dry-runs passed; consumer temp `npm install --package-lock-only --ignore-scripts /private/tmp/agentmemory-issue171-pack/agentmemory-agentmemory-0.9.27.tgz` produced no `node_modules/@anthropic-ai/sdk` or `node_modules/@anthropic-ai/claude-agent-sdk` package-lock entries.
- 2026-06-17: The temp consumer `npm install --package-lock-only --ignore-scripts` printed npm audit summary `15 vulnerabilities (10 moderate, 4 high, 1 critical)` for the broader resolved temp graph; required repo OSV gate passed with no unfiltered issues.
- 2026-06-17: Security gates so far: `git diff --check` passed; `osv-scanner scan source .` passed with existing narrow GHSA-8988-4f7v-96qf waiver; `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings; `gitleaks protect --staged --redact` passed with no leaks.
- 2026-06-17: Final review findings fixed before staging: Anthropic provider tests now assert request shape, and non-OK Anthropic responses no longer include upstream response body text in thrown errors.
- 2026-06-17: Existing local `origin/main` was captured as PR base `cf5f43b5b507aa59d335592020342313d5e1b773`; no fetch was run, so freshness is unverified. Current HEAD before commit is `fe927dc29686b1ca6ca0546cf271eef77f852684`.
- 2026-06-17: GitHub push prepare preflight found no staged files before task staging, no active hooks path, no commit/tag signing config, only sample hooks in `.git/hooks`, and no hook-manager references in repo config searched with `rg`.
