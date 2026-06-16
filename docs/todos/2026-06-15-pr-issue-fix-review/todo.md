# PR Issue Fix Review Task

Task id: `2026-06-15-pr-issue-fix-review`

## Scope

Review PR 892 for the Issue 700 and Issue 844 claims only. Issue 303 is out of scope for this worker because another batch owns that claim.

## Sprint Contract

Goal: decide whether the fork should import, adapt, reject, defer, mark already-fixed, or block PR 892 for the Issue 700 and Issue 844 claims.

Scope:
- Understand Issue 700 and Issue 844 first from public read-only issue data.
- Inspect PR 892 only after issue requirements are clear.
- Keep local notes neutral: no GitHub URLs, hash issue references, or account mentions.
- If code is adapted, keep it minimal and repo-conformant.
- Update the PR 892 worklist row.

Non-goals:
- Do not review the Issue 303 claim.
- Do not write to GitHub, push, create pull requests, label issues, or update fork tracker state.
- Do not introduce dependency changes or new external services.
- Do not copy user project data automatically during engine launch.

Acceptance criteria:
- Engine state for bundled/native config is anchored under the agentmemory home directory rather than caller project `data/`.
- Bundled `iii-exec` worker supervision uses resolvable absolute worker paths.
- User-provided project, home, or explicit config files remain respected.
- Remove planning accounts for generated runtime config.
- Targeted tests cover path selection, config rewriting, spawn cwd, and remove-plan behavior.
- Worklist row records the decision with neutral IDs only.

Intended verification:
- Targeted Vitest tests for engine launch and remove plan.
- `npm run lint`
- `npm test`
- `git diff --check`
- Required security gates for filesystem/process/config changes.

## Progress Notes

- 2026-06-16: Branch created from local `main` in the isolated worktree. Current branch initially lacked this task directory, so this scoped task record was created from the user request and locally inspected tracker context.
- 2026-06-16: Public unauthenticated read-only issue data shows Issue 700 concerns bundled relative `./data` state paths polluting caller projects, and Issue 844 concerns relative `iii-exec` worker supervision paths failing under global npm installs.
- 2026-06-16: Local repo evidence confirms `iii-config.yaml` still uses `./data/state_store.db`, `./data/stream_store`, `src/**/*.ts`, and `node dist/index.mjs`; `startIiiBin` starts the engine without anchoring cwd.
- 2026-06-16: Decision is `adapt`: PR 892's runtime-config and engine-cwd approach fits both issue claims, but the automatic caller-`data/` copy was not imported because it can misclassify project-owned data as agentmemory-owned state.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue-first review | Issue text and local code inspection | Done | Issue 700 and Issue 844 failure modes are recorded above before PR diff adaptation. |
| Engine launch adaptation | Targeted Vitest tests | Done | `npm test -- test/engine-launch.test.ts test/cli-remove.test.ts` passed with 22 tests after red-green coverage. |
| Remove-plan adaptation | Targeted Vitest test | Done | Generated runtime config is included in the remove plan when present. |
| Worklist row | Markdown inspection and neutral-reference scan | Done | PR 892 row records `adapt`; neutral-reference scan of this task directory found no forbidden URL, hash-reference, or mention patterns. |
| Security review | Diff-scoped checks | Done | Passive JS/TS secure-default review found no critical/major issue; Semgrep returned 0 findings for tracked files and explicit new files; diff-scoped security report recorded no reportable finding outside the repo. |

## Verification Notes

- `npm install --ignore-scripts --no-audit --no-fund --package-lock=false` materialized ignored local dependencies for verification only.
- `npm run lint` passed.
- `npm test -- test/engine-launch.test.ts test/cli-remove.test.ts` passed with 22 tests.
- `npm test` passed with 159 test files and 1993 tests.
- `git diff --check` passed.
- `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings on tracked files.
- `semgrep scan --config p/default --error --metrics=off --no-git-ignore src/cli/engine-launch.ts test/engine-launch.test.ts` passed with 0 findings on new files.
- Review Implementation was performed locally against the task-owned diff; independent subagent review was not used because the available subagent tool requires explicit user authorization for subagent work in this environment.

## Review Notes

PR 892 is relevant for Issue 700 and Issue 844. The fork should adapt the engine launch behavior rather than import the PR verbatim:

- Bundled/native config now generates a runtime config under the agentmemory home directory with absolute state paths and an absolute worker entrypoint.
- Native engine spawn now uses an explicit cwd selected from the config source.
- Repo-local development config remains unchanged when the invocation cwd owns `iii-config.yaml`.
- User-provided non-bundled configs are passed through without rewriting.
- The generated runtime config is included in remove planning.
- The upstream automatic legacy data copy is rejected for this branch because caller project `data/state_store.db` or `data/stream_store` may be user-owned content, and copying it into the agentmemory home directory would cross a filesystem/data ownership boundary without a reliable marker.
