# Issue 216 LAN And Backup Support

Task id: `2026-06-17-issue-216-lan-backup`

## Scope

Implement the smallest secure path for fork issue #216:

- Native runtime LAN binding support through explicit host configuration.
- Opt-in scheduled logical backups using the existing export function.
- User-facing documentation for secure LAN clients and backup restore.

## Sprint Contract

Goal: let operators intentionally bind the full native server to a LAN interface and create periodic restorable memory exports without weakening existing bearer-token or plaintext-HTTP safety boundaries.

Scope:
- Confirm the worktree, branch, origin fork, current git state, and relevant repo instructions before edits.
- Use TDD for runtime host rendering and backup scheduling behavior.
- Extend runtime iii-config rendering so REST and stream workers can bind to an explicit host.
- Fail closed when a non-loopback runtime host is requested without `AGENTMEMORY_SECRET`.
- Add an opt-in backup scheduler that calls `mem::export` and writes timestamped JSON files under a configured local directory.
- Document LAN setup, HTTPS or loopback-tunnel client requirements, backup env vars, and restore via existing import paths.

Non-goals:
- No new REST endpoints, MCP tools, export schema version, migrations, dependency changes, remote service actions, or direct SQLite backup copying.
- No weakening of the existing plaintext bearer guard; plaintext `http://192.168.x.x` with `AGENTMEMORY_SECRET` remains refused by clients.
- No automatic restore command unless the existing import path proves insufficient.
- No changes to Docker/deploy service boundaries beyond documentation if the existing deploy path already covers hosted server mode.

Acceptance criteria:
- `--host <host>` and `AGENTMEMORY_HOST` can render `iii-http` and `iii-stream` worker hosts while preserving default `127.0.0.1`.
- Non-loopback hosts require `AGENTMEMORY_SECRET` before startup renders a LAN config.
- Existing `--port`/`--instance` behavior and CORS origin rendering remain intact.
- Scheduled backups are disabled by default, require an explicit backup directory, and write valid JSON export files atomically when enabled.
- Optional backup retention only deletes files matching the agentmemory backup naming pattern inside the configured backup directory.
- README and `.env.example` describe safe LAN and backup usage without suggesting plaintext bearer auth over LAN.

Intended verification:
- Red then green targeted Vitest:
  - `./node_modules/.bin/vitest run test/runtime-ports-render.test.ts test/backup-scheduler.test.ts`
- Broader focused Vitest:
  - `./node_modules/.bin/vitest run test/runtime-ports-render.test.ts test/plaintext-bearer-auth.test.ts test/export-import.test.ts test/backup-scheduler.test.ts`
- Hygiene and security:
  - `git diff --check`
  - `semgrep scan --config p/default --error --metrics=off src/cli/runtime-ports.ts src/cli.ts src/index.ts src/functions/backup-scheduler.ts test/runtime-ports-render.test.ts test/backup-scheduler.test.ts README.md .env.example docs/todos/2026-06-17-issue-216-lan-backup`
  - `gitleaks protect --staged --redact` before commit.
- If dependency/build-script hardening blocks `corepack pnpm` wrappers, use direct project-local binaries already present under `node_modules` and record the blocker.

Known boundaries:
- Deploy templates already bind container-internal workers to `0.0.0.0`, set a generated secret, expose only REST, and expect TLS/reverse-proxy boundaries; this task does not change those service templates.
- LAN clients with bearer auth must use HTTPS or a loopback tunnel. The current MCP/CLI guard intentionally refuses remote plaintext HTTP before sending credentials.
- Logical JSON export backups are safer than copying SQLite while the iii-engine owns state, but they are not byte-for-byte database snapshots.
- Backup paths are operator-controlled local filesystem paths; retention cleanup must remain constrained to agentmemory backup filenames inside that directory.

Stop conditions:
- Stop before adding dependencies, changing auth semantics, relaxing plaintext bearer checks, adding externally consumed APIs, or changing schema/export versions.
- Stop if backup scheduling requires direct SQLite file access, cron daemon integration, or service manager changes.
- Stop if local verification needs private registry credentials or dependency installation not already approved.
- Stop before any remote ticket close/comment unless local implementation, merge preparation, and verification have succeeded.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Preflight and branch safety | `git status`, `git worktree list`, `git remote -v`, branch creation | Done | Worktree started clean and detached at `d23aea58`; origin is `https://github.com/wbugitlab1/agentmemory.git`; created local branch `prep-merge/issue-216-lan-backups-d23aea58`. |
| LAN host rendering | Runtime-port TDD | Done | Red run failed on missing host helpers and unchanged `127.0.0.1`; green run passed with host rendering coverage. |
| Non-loopback host secret guard | Runtime-port TDD and CLI wiring test | Done | `assertRuntimeHostAllowed()` now rejects `AGENTMEMORY_HOST=0.0.0.0` without `AGENTMEMORY_SECRET`; targeted tests passed. |
| Scheduled logical backups | Backup scheduler TDD | Done | Red run failed on missing scheduler module; green run passed for disabled default, missing dir, atomic JSON write, filename-scoped retention, and export failure handling. |
| Secure docs | README and `.env.example` scan | Done | `rg` found the new LAN docs requiring `AGENTMEMORY_SECRET`, HTTPS or loopback tunnel; no new plaintext bearer LAN setup was introduced. |
| Focused regression coverage | Vitest | Done | `./node_modules/.bin/vitest run test/runtime-ports-render.test.ts test/plaintext-bearer-auth.test.ts test/cli-http-auth.test.ts test/cli-server-log.test.ts test/export-import.test.ts test/backup-scheduler.test.ts` passed 6 files / 51 tests. |
| Build smoke | `tsdown` | Done | `./node_modules/.bin/tsdown` completed successfully; generated tracked plugin bundle noise was reverted because it was not task-owned source. Existing tsdown deprecation/timing/dynamic-import warnings remain. |
| Typecheck | `tsc --noEmit` | Blocked | Repo-wide `./node_modules/.bin/tsc --noEmit --pretty false` fails on pre-existing unrelated errors outside the touched implementation. |
| Prep-merge gates | Focused tests, diff checks, security scans, review chain | Done | `git diff --check` and `git diff --cached --check` passed; staged Semgrep scanned 14 tracked files with 0 findings; `gitleaks protect --staged --redact` found no leaks. |
| Local main integration | Merge local `main`, rerun repo-native checks | Done | Merged local `main` (`42af80e5`) into the prep branch without conflict; `corepack pnpm exec vitest ...` passed 6 files / 51 tests; `corepack pnpm exec tsdown` passed after `corepack pnpm install --frozen-lockfile --ignore-scripts` resolved ignored-build hardening without lockfile changes. |
| Issue close | GitHub issue state check and close | Planned | Only after successful local merge preparation. |

## Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output | Result | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Pre-implementation design validation | LAN host config, backup scheduler reuse, tests to add | No | Read-only findings with file references and red flags | Done: confirmed minimal path should use runtime host rendering, `mem::export`, no new endpoints/tools/version, and keep plaintext bearer guard. | Main agent remains responsible for final design and integration. |
| Security/privacy review | Auth, host binding, backup path, docs | No | Important security regressions and residual risks | Done: found CLI `apiFetch()` would send `.env`-loaded bearer auth over remote plaintext; fixed by routing through `buildJsonRequestHeaders()`. | Final staged scan still required. |
| Test coverage review | Runtime host tests, backup retention, scheduler path | No | Missing coverage and proof gaps | Done: added host `--host=`, env-file merge, malformed host, atomic temp/rename, unrelated retention, and scheduler interval coverage. | Full repo typecheck remains blocked by unrelated baseline errors. |
| Maintainability/integration review | Env naming, interval bounds, integration state | No | Integration risks and simpler design suggestions | Done: removed generic `BACKUP_*` aliases, bounded scheduler intervals to Node-safe range, and updated task records. | Re-run staged Semgrep/Gitleaks before commit. |

## Progress Notes

- 2026-06-17: Read required feature-loop, prep-merge, planning, TDD, brainstorming, subagent-development, and verification skills.
- 2026-06-17: Confirmed clean worktree, detached `d23aea58`, fork `origin`, no staged changes, and created branch `prep-merge/issue-216-lan-backups-d23aea58`.
- 2026-06-17: Started read-only explorer subagent for independent validation of the minimal secure design.
- 2026-06-17: Added red tests for runtime host rendering and backup scheduler; first runnable Vitest command failed for the intended missing behavior.
- 2026-06-17: Implemented `AGENTMEMORY_HOST`/`--host`, non-loopback secret guard, opt-in export backup scheduler, and runtime `.env` loading for host/secret/port keys. Targeted TDD run passed 2 files / 14 tests; broader focused run passed 6 files / 51 tests after review-driven coverage expansion.
- 2026-06-17: Full `./node_modules/.bin/tsc --noEmit --pretty false` is blocked by pre-existing repo-wide TypeScript errors outside this task, including `src/cli/ready-hint.ts`, `src/functions/export-import.ts`, `src/functions/mesh.ts`, `src/functions/slots.ts`, `src/mcp/server.ts`, and `src/triggers/api.ts`.
- 2026-06-17: `./node_modules/.bin/tsdown` build smoke completed successfully. It touched generated plugin bundles; task-owned generated noise was removed from the diff.
- 2026-06-17: Security and maintainability review found two important design risks: CLI status requests could have bypassed plaintext bearer protections after `.env` loading, and generic `BACKUP_*` aliases broadened the configuration surface. The implementation now uses `buildJsonRequestHeaders()` for `apiFetch()` and accepts only `AGENTMEMORY_BACKUP_*` scheduler keys.
- 2026-06-17: Additional review hardening added a Node-safe backup interval range, explicit host-with-port rejection, atomic-write proof via injected filesystem calls, old unrelated file retention proof, and real scheduled-run coverage.
- 2026-06-17: A final CLI scope pass removed the runtime host guard from the general command dispatcher so status/doctor-only commands stay diagnostic; guard enforcement remains in runtime config rendering and worker startup.
- 2026-06-17: Staged prep-merge gates passed: cached diff check, Semgrep over changed tracked files, and Gitleaks staged secret scan.
- 2026-06-17: Merged local `main` (`42af80e5`) into the prep branch. The only incoming change was the repo instruction to prefer `corepack pnpm` verification after pnpm ignored-build hardening.
- 2026-06-17: Re-ran verification on the integrated branch through repo-native `corepack pnpm exec` commands. Initial `pnpm exec` hit ignored-build hardening, then `corepack pnpm install --frozen-lockfile --ignore-scripts` completed without dependency metadata changes; focused Vitest and `tsdown` passed.

## Review Notes

Resolved review findings:
- `apiFetch()` no longer sends `AGENTMEMORY_SECRET` on remote plaintext HTTP; it delegates to the existing URL-aware bearer-header helper and returns no data when the helper refuses.
- Status/doctor-only commands are not blocked by LAN host validation; server startup still fails closed through `prepareRuntimeIiiConfig()` and `src/index.ts`.
- The backup scheduler remains opt-in only through namespaced `AGENTMEMORY_BACKUP_*` variables.
- Backup intervals outside 60 seconds through 2,147,483,647 ms fall back to the 24-hour default instead of relying on Node timer clamping.
- Retention cleanup is constrained to regular files matching the exact agentmemory backup filename pattern inside the configured directory.

Residual risks:
- Repo-wide typecheck is still blocked by pre-existing baseline errors unrelated to this issue.
- `corepack pnpm exec tsdown` still emits existing deprecation/plugin timing/dynamic-import warnings.
