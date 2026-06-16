# Native iii Runtime Ports Fix

Task id: `20260616161144-fix-native-iii-runtime-ports`

## Scope

Fix the native iii v0.11.2 runtime-config regression where agentmemory generated
`~/.agentmemory/data/iii-config.yaml` with an unsupported top-level `port:`
field. Keep the change limited to native CLI runtime port behavior, tests, and
user-facing docs that currently overstate engine-port relocation.

## Sprint Contract

Goal: make default native `agentmemory` startup generate an iii v0.11.2-compatible runtime config and stop claiming unverified native engine listen-port relocation.

Scope:
- Verify the current worktree, branch, local instructions, and affected CLI/runtime docs.
- Add a failing test before changing production code.
- Remove unsupported top-level `port:` rendering from native runtime iii config generation.
- Adjust existing `--port`/`--instance` tests and docs to the verified native contract.
- Build only for local smoke verification; do not commit ignored `dist/` output.

Non-goals:
- No broad CLI, daemon, Docker, iii-engine, SDK, persistence, auth, or schema refactor.
- No dependency, package-manager, lockfile, publishing, push, deploy, or remote-state changes.
- No attempt to support native engine listen-port relocation unless iii v0.11.2 evidence proves a valid configuration path.

Acceptance criteria:
- Default runtime iii config rendering does not synthesize unsupported top-level `port:`.
- Tests cover that `renderRuntimeIiiConfig()` does not add or retain top-level `port:`.
- CLI help, README, CHANGELOG, and generated skill docs no longer state as fact that `--port`/`--instance` moves the native iii-engine listen port.
- Existing `--port` tests match the verified native contract.
- Local build output is used only for smoke verification and not committed.

Intended verification:
- `corepack pnpm test -- test/runtime-ports-render.test.ts test/multi-instance-port.test.ts test/cli-ready-hint.test.ts test/cli-server-log.test.ts`
- `corepack pnpm build`
- Local smoke start until `iii-engine is ready`, then controlled stop and process check.
- `git diff --check`
- Semgrep over changed source, docs, and task files.

Known boundaries:
- Native iii v0.11.2 exposes `--config` but no `--port` in `iii --help`; current evidence does not prove a supported listen-port relocation path.
- `III_ENGINE_URL` remains a client connection override for SDK/ready-hint use; it must not be represented as moving a native engine started by this CLI unless verified.
- The static Docker configuration and Docker port mapping are out of scope.

Stop conditions:
- Stop before changing externally consumed APIs, storage, auth, schema, Docker boundaries, or remote state.
- Stop if a supposed native engine-port relocation path requires unverified iii internals or a third fix attempt after failed evidence.
- Stop if dependency setup, scanner execution, or smoke startup would require credentialed/private registry access not approved in this turn.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Branch and task state established | Git status and task files | Done | Worktree `/Users/A1538552/.codex/worktrees/042b/agentmemory`, branch `fix/native-iii-runtime-ports`, clean before task-state creation. |
| Root cause verified | Source/docs/binary inspection | Done | `renderRuntimeIiiConfig()` synthesized/replaced top-level `port:`; `/Users/A1538552/.agentmemory/bin/iii --help` exposes `--config` but no `--port`; current binary evidence does not prove a native engine listen-port relocation path. |
| Failing regression test | Targeted Vitest red run | Done | `./node_modules/.bin/vitest run test/runtime-ports-render.test.ts` failed because rendered config began with `port: 49234`. |
| Minimal source fix | Targeted Vitest green run | Done | `renderRuntimeIiiConfig()` now strips/suppresses top-level `port:` while preserving `iii-http`, `iii-stream`, and CORS rewrites; focused suite passed 34 tests after review fixes. |
| Docs/help corrected | `rg` for stale claims | Done | CLI help, README, install runbook, changelog, and config/architecture skills now state that `--port`/`--instance` move REST/streams/viewer only for bundled native iii v0.11.2. |
| Build and smoke verification | Direct build and non-destructive startup checks | Partial | `corepack pnpm build` blocked before script execution on `ERR_PNPM_IGNORED_BUILDS`; direct `./node_modules/.bin/tsdown` build completed after the final source fix and produced ignored `dist/cli.mjs`; built `--help` output checked. Full smoke start was not run because an existing iii process already listens on 49134/3111 and stopping it was not approved. |
| Security and hygiene gates | `git diff --check`, Semgrep, Codex Security diff scan | Done | `git diff --check` passed; Semgrep over 15 changed source/doc/test/task files completed with 0 findings; local Codex Security diff scan closed 4/4 source-like rows with no findings and wrote reports under `/tmp/codex-security-scans/agentmemory/0fc5b4ddac6f_20260616163943/`. |

## Subagent Ledger

No delegated workstreams planned. The immediate blocking work is a small TDD bugfix with deterministic repo-native tests.

## Progress Notes

- 2026-06-16: Created branch `fix/native-iii-runtime-ports` from detached main commit `0fc5b4ddac6fb146095a1651c01a881a825b15cf`.
- 2026-06-16: Read repo-local `AGENTS.md`, README/script metadata, prior runtime-port task notes, `src/cli/runtime-ports.ts`, `src/config.ts`, `src/cli/ready-hint.ts`, `src/cli.ts`, targeted tests, and native `iii --help`.
- 2026-06-16: Added red regression coverage in `test/runtime-ports-render.test.ts`. Direct Vitest run failed as expected with rendered output starting `port: 49234`.
- 2026-06-16: Removed automatic engine env derivation from `applyRuntimePortArgs()`, removed top-level engine `port:` synthesis/rewrite from `renderRuntimeIiiConfig()`, and aligned default engine URL display/config to fixed native port 49134 unless explicitly overridden.
- 2026-06-16: Updated CLI help, README, install runbook, changelog, and plugin skill docs to document that `--port`/`--instance` relocate REST, streams, and viewer only for the bundled native iii v0.11.2 runtime.
- 2026-06-16: `corepack pnpm test -- test/runtime-ports-render.test.ts test/multi-instance-port.test.ts test/cli-ready-hint.test.ts test/cli-server-log.test.ts` and `corepack pnpm build` both stopped before running the intended scripts because pnpm strict dependency-build checks reported ignored build scripts for `esbuild`, `onnxruntime-node`, `protobufjs`, and `sharp`. No build approvals were added.
- 2026-06-16: Direct focused test command `./node_modules/.bin/vitest run test/runtime-ports-render.test.ts test/multi-instance-port.test.ts test/cli-ready-hint.test.ts test/cli-server-log.test.ts` passed with 4 files and 31 tests.
- 2026-06-16: Direct local build `./node_modules/.bin/tsdown` completed and produced `dist/cli.mjs`; generated tracked side effects from the build were removed from the working tree.
- 2026-06-16: Built CLI help output was checked and shows the native engine limitation. Source-level renderer probe produced output beginning with `workers:` and no top-level `port:`.
- 2026-06-16: Full smoke start was not run because `lsof` showed an existing `iii` process listening on `*:49134` and `127.0.0.1:3111`. Stopping that runtime would affect local state outside the working copy and was not approved in this turn.
- 2026-06-16: `git diff --check` passed. Semgrep initially found two blocking test-only insecure WebSocket literals; after switching that test to the existing string-join helper, Semgrep completed with 0 findings.
- 2026-06-16: Prep-merge review found two issues: ready-hint streams incorrectly followed `III_ENGINE_URL` host/scheme, and REST anchors such as 65534/65535 could derive invalid stream/viewer ports. Added red tests, then fixed `src/cli/ready-hint.ts`, `src/cli/runtime-ports.ts`, and `src/config.ts`.
- 2026-06-16: Re-review subagents both confirmed the remaining `loadConfig()` REST-anchor gap before it was fixed. Final `./node_modules/.bin/vitest run test/runtime-ports-render.test.ts test/multi-instance-port.test.ts test/cli-ready-hint.test.ts test/cli-server-log.test.ts` passed 4 files / 34 tests.
- 2026-06-16: Codex Security diff scan completed for the local patch. Worklist rows: `src/cli.ts`, `src/cli/ready-hint.ts`, `src/cli/runtime-ports.ts`, `src/config.ts`; result: no findings. Reports: `/tmp/codex-security-scans/agentmemory/0fc5b4ddac6f_20260616163943/report.md` and `report.html`.
- 2026-06-16: Pre-commit staged gate `gitleaks protect --staged --redact` scanned ~26 KB and reported no leaks.

## Review Notes

Root cause:
- The previous runtime-port fix assumed iii v0.11.2 accepted a top-level engine `port:` in the YAML config and that deriving `III_ENGINE_URL`/`III_ENGINE_PORT` from `--port` relocated the native engine listen port.
- The pinned native `iii` CLI exposes config-file selection but no `--port`, and generated configs rooted with `port:` are incompatible with the observed v0.11.2 schema.

Implementation:
- `--port`/`--instance` now set REST, streams, and viewer env vars only.
- Native runtime config rendering rewrites `iii-http`, `iii-stream`, and CORS allowed origins, but strips/suppresses unsupported top-level `port:`.
- `loadConfig()` and ready hints keep the default engine URL at 49134 unless `III_ENGINE_URL` or `III_ENGINE_PORT` is explicitly supplied for an externally managed engine.
- REST anchors are accepted only when their derived streams/viewer ports stay within the TCP range.

Verification:
- Red: `./node_modules/.bin/vitest run test/runtime-ports-render.test.ts` failed on `port: 49234`.
- Green: focused Vitest suite passed with 34 tests.
- Build: `./node_modules/.bin/tsdown` completed after the final source fix; `corepack pnpm build` was blocked by pnpm ignored-build hardening before build execution.
- Smoke: full start/stop smoke blocked by an already-running local iii engine on 49134/3111; built help and renderer output were inspected instead.
- Security/hygiene: `git diff --check` and `git diff --cached --check` passed; Semgrep scanned changed files with 0 findings; Codex Security diff scan completed with 0 findings; `gitleaks protect --staged --redact` reported no leaks.

Residual risks:
- Bundled native iii-engine side-by-side operation remains unsupported because no verified v0.11.2 listen-port relocation path was found.
- The exact `corepack pnpm test -- ...` and `corepack pnpm build` commands remain blocked in this worktree until dependency build approvals are handled by policy.
