# Issue 216 LAN And Backup Support Implementation Plan

> For agentic workers: use the local TDD loop and keep this plan updated. Do not add endpoints, dependencies, schema versions, or remote actions unless the main user explicitly approves that expansion.

**Goal:** Add intentional LAN bind configuration and opt-in scheduled backups while preserving the existing security posture.

**Architecture:** Reuse the native runtime config renderer for server binding and reuse `mem::export` for backup payloads. Keep LAN exposure as an explicit operator choice guarded by `AGENTMEMORY_SECRET`. Keep client-side plaintext bearer protection unchanged: LAN clients with a secret use HTTPS or a loopback tunnel.

**Tech Stack:** TypeScript ESM, Node filesystem timers, iii-sdk function trigger, Vitest, Markdown docs.

## File Structure

- `src/cli/runtime-ports.ts`: extend runtime config rendering to accept `AGENTMEMORY_HOST`; add CLI arg application helper and validation helpers for host safety.
- `src/cli.ts`: wire `--host <host>` before runtime config rendering and document the option.
- `src/functions/backup-scheduler.ts`: new opt-in scheduler/helpers for export JSON backups and retention.
- `src/index.ts`: start the backup scheduler after export/import registration.
- `test/runtime-ports-render.test.ts`: red/green tests for host rendering and non-loopback secret guard.
- `test/backup-scheduler.test.ts`: red/green tests for backup config parsing, one-shot backup write, and retention.
- `README.md` and `.env.example`: document LAN and backup configuration.
- `docs/todos/2026-06-17-issue-216-lan-backup/todo.md`: keep progress, delegation, verification, caveats, and review notes current.

## Task 1: Red Tests For LAN Host Config

- [x] Add tests in `test/runtime-ports-render.test.ts` for:
  - `applyRuntimeHostArgs(["--host", "0.0.0.0"], env)` setting `AGENTMEMORY_HOST`.
  - `renderRuntimeIiiConfig()` rewriting `iii-http` and `iii-stream` `host:` lines when `AGENTMEMORY_HOST` is set.
  - Host rendering preserving port and allowed-origin behavior.
  - `assertRuntimeHostAllowed()` throwing for non-loopback host without `AGENTMEMORY_SECRET` and allowing loopback/default.
- [x] Run `./node_modules/.bin/vitest run test/runtime-ports-render.test.ts`.
- [x] Confirm failure is due to missing host behavior, not setup.

Evidence: first run of `./node_modules/.bin/vitest run test/runtime-ports-render.test.ts test/backup-scheduler.test.ts` failed because `applyRuntimeHostArgs`/`assertRuntimeHostAllowed` were missing and the rendered worker hosts stayed at `127.0.0.1`.

## Task 2: Implement LAN Host Config

- [x] Add host parsing and loopback detection helpers in `src/cli/runtime-ports.ts`.
- [x] Add `applyRuntimeHostArgs(args, env)` and call it from `src/cli.ts` next to port arg handling.
- [x] Add `assertRuntimeHostAllowed(env)` and call it before runtime config rendering/startup side effects.
- [x] Update `renderRuntimeIiiConfig()` to rewrite worker `host:` fields for `iii-http` and `iii-stream` only when a host is configured.
- [x] Keep Docker/deploy static configs unchanged.
- [x] Run targeted LAN tests green.

Evidence: `./node_modules/.bin/vitest run test/runtime-ports-render.test.ts test/backup-scheduler.test.ts` passed 2 files / 14 tests after implementation.

## Task 3: Red Tests For Backup Scheduler

- [x] Create `test/backup-scheduler.test.ts` with tests for:
  - Backup scheduler disabled by default.
  - Enabled backup config requires a directory.
  - One backup run triggers `mem::export` and writes `agentmemory-backup-<timestamp>.json` atomically.
  - Retention deletes only `agentmemory-backup-*.json` files older than the configured threshold inside the backup directory.
  - Export failures are logged and do not throw out of the scheduler loop.
- [x] Run `./node_modules/.bin/vitest run test/backup-scheduler.test.ts`.
- [x] Confirm failure is due to missing scheduler.

Evidence: first run failed because `src/functions/backup-scheduler.ts` did not exist.

## Task 4: Implement Backup Scheduler

- [x] Add `src/functions/backup-scheduler.ts` with pure config parsing helpers, `runBackupOnce()`, `pruneOldBackups()`, and `startBackupScheduler()`.
- [x] Use `sdk.trigger({ function_id: "mem::export", payload: {} })`.
- [x] Write JSON via temporary file then rename into the final filename.
- [x] Keep retention opt-in and filename-scoped.
- [x] Wire `startBackupScheduler()` in `src/index.ts` after `registerExportImportFunction()`.
- [x] Run targeted backup tests green.

Evidence: `./node_modules/.bin/vitest run test/runtime-ports-render.test.ts test/backup-scheduler.test.ts` passed 2 files / 14 tests.

## Task 5: Documentation

- [x] Update CLI help and `.env.example` with `--host`, `AGENTMEMORY_HOST`, and backup env vars.
- [x] Add README sections for:
  - LAN server mode: `AGENTMEMORY_HOST=0.0.0.0` plus `AGENTMEMORY_SECRET`.
  - Client setup through HTTPS or loopback tunnel, not plaintext bearer auth over LAN.
  - Scheduled export backups and restore through `/agentmemory/import` or `memory_import`-equivalent tooling already present.
- [x] Search for stale/conflicting LAN and backup statements.

Evidence: README documents secure LAN mode and scheduled logical exports; `.env.example` lists host and backup env vars and no longer describes snapshots as scheduled backups. `rg` found no new instruction to send bearer auth over plaintext LAN HTTP.

## Task 6: Verification, Reviews, Prep-Merge, Issue Close

- [x] Run focused Vitest:
  - `./node_modules/.bin/vitest run test/runtime-ports-render.test.ts test/plaintext-bearer-auth.test.ts test/cli-http-auth.test.ts test/cli-server-log.test.ts test/export-import.test.ts test/backup-scheduler.test.ts`
- [x] Record blocked repo-wide typecheck:
  - `./node_modules/.bin/tsc --noEmit --pretty false`
- [x] Run build smoke:
  - `./node_modules/.bin/tsdown`
- [x] Run `git diff --check`.
- [x] Run preliminary Semgrep over changed source/test/doc/task files.
- [x] Complete required review chain from `prep-merge-to-local-main`.
- [x] Re-run Semgrep after staging so new files are tracked.
- [x] Stage intended files and run `gitleaks protect --staged --redact`.
- [x] Commit and merge local `main` into the prep branch.
- [x] Re-run focused repo-native checks after the local `main` merge.
- [ ] Merge the prep branch to local `main` per prep skill if final gates pass.
- [ ] Close GitHub issue #216 after successful local merge preparation.

## Self Review

- Spec coverage: every acceptance criterion maps to a test or documented check.
- Placeholder scan: no implementation placeholders are expected after Task 6.
- Boundary check: no REST/MCP count/version/schema/dependency changes are planned.
- Review resolution: Important findings from security, coverage, and maintainability reviewers are fixed in source and covered by focused tests.
