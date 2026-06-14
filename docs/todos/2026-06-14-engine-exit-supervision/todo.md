# Engine Exit Supervision

## Scope

Owner: agentmemory CLI runtime.

## Sprint Contract

Goal: prevent a native iii-engine child exit from leaving the foreground `agentmemory` process in an endless reconnect loop with no recovery.

Scope:
- Diagnose the Jun 14 terminal log and local runtime evidence.
- Add bounded native engine restart supervision after a successful foreground start.
- Preserve intentional stop behavior for SIGTERM/SIGINT.
- Keep persistent server logging behavior intact.

Non-goals:
- Do not change REST/MCP APIs, state schema, or iii-engine version pinning.
- Do not alter Docker supervision semantics.
- Do not delete or reset local runtime data.

Acceptance criteria:
- Unexpected native engine exits are logged and schedule a bounded restart.
- SIGTERM/SIGINT engine exits are treated as intentional and do not restart.
- Restart exhaustion is logged and terminates the foreground process instead of leaving an infinite reconnect loop.
- Targeted tests and build pass, or limitations are recorded.

Intended verification:
- Targeted Vitest tests for CLI logging/supervision.
- `npm run build`.
- Broader tests/security checks if implementation surface grows or before commit.

## Diagnosis

- Attached terminal log shows `agentmemory v0.9.27` starts at `~/.agentmemory/bin/iii` v0.11.2.
- Around line 448 the worker switches from normal observation captures to `[OTel] Disconnected from engine` and repeated `[iii] Reconnecting...`.
- Current ports `127.0.0.1:3111` and `:49134` are not listening.
- `~/.agentmemory/engine-state.json` and `iii.pid` are absent; `worker.pid` remains.
- `~/.agentmemory/logs/server.log` is empty and unchanged from Jun 13; the global build containing persistent logging was updated at Jun 14 14:37, after the 14:00 restart.
- macOS Unified Logs show `iii[95070]` FSEvents errors around 14:21 but no diagnostic crash report for `iii` or `node`.
- Follow-up incident at 17:01:50 is now reconstructed from `~/.agentmemory/logs/server.log`: iii reload detected a config change and tried to reload `/Users/A1538552/_projects/_tools/agentmemory/dist/iii-config.yaml`; the file was missing, so reload failed with `Config file not found` and iii-engine exited with code 1. That path is volatile because `npm run build` cleans `dist/` before copying `iii-config.yaml` back.

## Feature / Verification Matrix

| Change | Verification | Status | Evidence |
| --- | --- | --- | --- |
| Diagnose runtime failure mode | Terminal paste, ports, pid/state files, Unified Logs | done | Engine gone; worker reconnect loop |
| Native engine exit supervision | Targeted tests | done | `npm test -- test/engine-supervisor.test.ts test/cli-server-log.test.ts` passed, 19 tests |
| Build/type safety | `npm run build` | done | Passed with existing tsdown/Rolldown warnings |
| Full regression suite | `npm test` | done | A concurrent full run had unrelated timeout/fake-timer failures; the seven failed files then passed as a group, and a standalone rerun passed: 143 files, 1679 tests |
| Runtime security scan | Semgrep default registry and Codex Security diff scan | done | Semgrep passed targeted changed files and repo-wide; Codex Security diff scan found 0 reportable findings at `/tmp/codex-security-scans/agentmemory/e916237c549a_20260614T172847+0200` |
| Stable reload config path | Targeted CLI log/config test, build, full tests | done | Package-root bundled `iii-config.yaml` now wins before volatile `dist/iii-config.yaml` while env/cwd/home overrides remain first; `dist/cli.mjs` order was inspected after build |

## Progress

- 2026-06-14: Diagnosis complete; implementation starting.
- 2026-06-14: Added native iii-engine exit supervision with bounded restarts and explicit restart exhaustion.
- 2026-06-14: Verification complete: targeted tests, full tests, build, diff check, and Semgrep passed.
- 2026-06-14: Simplification pass removed duplicate supervisor log writes and fixed retry rescheduling after failed restart attempts.
- 2026-06-14: Focused code review found the restart history was cleared after successful restart; fixed so repeated crash-after-ready exits still exhaust within the restart window.
- 2026-06-14: Adversarial review found restart success only checked the engine root and failed attempts could overlap child processes; fixed by requiring `/agentmemory/livez`, generation-guarding native child cleanup, and stopping failed restart children before rescheduling.
- 2026-06-14: Final verification rerun: targeted tests, full tests, build, Semgrep, and Codex Security diff scan passed on the current diff.
- 2026-06-14: New crash log identified a concrete root cause: running iii-engine used `dist/iii-config.yaml` as its watched config, and a local build removed `dist/` long enough for iii reload to fail fatally. Fixed by preferring the stable package-root config path over the volatile dist copy.
- 2026-06-14: Prep-merge reviews accepted the patch; focused review's minor test-gap was addressed by asserting `AGENTMEMORY_III_CONFIG` remains first in the config precedence chain.

## Final Review Notes

- Acceptance criteria met.
- Remaining caveat: the attached 14:00 run cannot be reconstructed from `~/.agentmemory/logs/server.log` because the global build containing the persistent log tee was updated at 14:37; the terminal paste and system logs are the available evidence for that incident.
- Follow-up caveat resolved for the 17:01 run: persistent logs captured the reload failure and missing `dist/iii-config.yaml`.
- Runtime caveat: the currently running daemon is not restarted by this task; it will use the fixed package-root config path after it is started with this CLI build.
- No REST/MCP API, schema, auth, or dependency changes.
