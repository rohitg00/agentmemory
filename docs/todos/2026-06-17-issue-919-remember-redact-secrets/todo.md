# Issue 919 Remember Skill Secret Redaction

## Scope

- Repository: `/Users/A1538552/.codex/worktrees/d2c1/agentmemory`
- Branch: `github-pr/issue-919-remember-redact-secrets-0cd87113`
- Target issue: `wbugitlab1/agentmemory#919`, mirroring upstream PR `rohitg00/agentmemory#941`
- Task type: docs/skill workflow hardening for explicit `memory_save` usage

## Evidence Before Edits

- `git status -sb --untracked-files=all`: clean detached `HEAD` before branch creation.
- Local branch created from `0cd8711303473b5cc1cd3ac7fd8739a2d40f8831`.
- `origin` points to `https://github.com/wbugitlab1/agentmemory.git`; `upstream` points to `https://github.com/rohitg00/agentmemory.git`.
- No fetch, pull, push, or PR creation approval was granted.
- Validity investigation:
  - `plugin/skills/remember/SKILL.md` tells agents to preserve the user's own phrasing and call `memory_save`.
  - `plugin/opencode/commands/remember.md` repeats `content` as full text preserving user phrasing.
  - `src/functions/remember.ts` stores `content: data.content`; `src/mcp/server.ts`, `src/triggers/api.ts`, and `src/mcp/standalone.ts` forward explicit save content without applying `stripPrivateData`.
  - `src/functions/privacy.ts` provides `stripPrivateData`, and `src/functions/observe.ts` uses it for observation capture, but explicit remember/save paths are not covered.
- Read-only subagent validity result: valid/actionable. The subagent found the same gap and reported no edits.

## Sprint Contract

Goal: Update the user-facing `remember` skill guidance so explicit memory saves preserve useful meaning while redacting credentials and secrets before `memory_save`.

Scope:
- Update `plugin/skills/remember/SKILL.md` workflow and checklist to require sanitization before calling `memory_save`.
- Add or update `plugin/skills/remember/EXAMPLES.md` with a security-sensitive operational note that keeps meaning but does not persist a raw secret.
- Update `plugin/opencode/commands/remember.md` so OpenCode slash-command guidance matches the skill guidance.
- Keep task state current.

Non-goals:
- No runtime behavior, MCP/REST/schema/auth/persistence/indexing changes.
- No dependency, generated-reference, translation, README, or plugin metadata changes unless verification proves they are required for this issue.
- No fetch, pull, push, PR creation, PR merge, publish, deploy, destructive cleanup, or remote state change.
- No PR or branch targeting `rohitg00/agentmemory`.

Acceptance criteria:
- `remember` skill tells agents to inspect user-provided memory content for secrets before saving.
- `remember` skill tells agents to replace raw credentials with descriptive placeholders while preserving non-sensitive operational meaning.
- `remember` examples include a security-sensitive note that demonstrates redaction before `memory_save`.
- OpenCode `/remember` guidance no longer instructs agents to persist raw phrasing when secrets are present.
- Skill lint/check and focused text verification pass, or blockers are recorded with closest available evidence.

Known boundaries:
- This is a documentation/agent-workflow change touching a security-sensitive prompt surface.
- Changing runtime sanitization would alter persistence behavior and is outside this task.
- `origin/main` freshness requires explicit approval for `git fetch`; absent that, local `origin/main` only may be used during PR prep.

Stop conditions:
- A required fix would change runtime behavior, public APIs, auth/security controls, schema, persistence, dependencies, generated broad surfaces, or remote state.
- Verification reveals generated skill docs require broad non-task-owned rewrites.
- Required security scans produce findings that cannot be fixed inside scope.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Validity decision | Main + read-only subagent source inspection | Done | Current guidance preserves raw phrasing; explicit save path stores raw content; subagent result valid/actionable. |
| Update `remember` skill workflow | `rg`/line inspection and `corepack pnpm run skills:check` | Done | `plugin/skills/remember/SKILL.md` now requires pre-save secret inspection and sanitized `content`; skill is 67 lines, below the 100-line lint limit; `skills:check` passed. |
| Add safe secret-redaction example | `rg`/line inspection and `corepack pnpm run skills:check` | Done | `plugin/skills/remember/EXAMPLES.md` now includes a security-sensitive example using sentinel placeholders only; targeted raw-secret pattern search returned no matches; `skills:check` passed. |
| Align OpenCode command guidance | `rg`/line inspection | Done | `plugin/opencode/commands/remember.md` now requires redaction before `memory_save` and forbids echoing secret values. |
| Security-sensitive docs diff review | Diff inspection, Gitleaks detect, staged Gitleaks before commit, Semgrep if available | In progress | Final read-only docs/security reviewer ACCEPT; Codex Security diff scan reported no findings at `/tmp/codex-security-scans/agentmemory/0cd87113_20260617T164703Z/report.md`; Semgrep passed with 0 findings; current-tree `gitleaks detect --source . --redact --no-git` passed. Full-history `gitleaks detect --source . --redact` reported 14 historical leaks across 806 commits. Staged Gitleaks still pending. |
| Local GitHub PR prep | `github-push-prepare` local branch-prep phase | Pending | Not run yet. |

## Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output | Result | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Validity investigation | Current origin checkout: `plugin/skills/remember`, OpenCode command, explicit save paths, privacy filter | No | Validity decision, files inspected, commands, evidence, uncertainties, risks | Done: valid/actionable; current guidance does not already handle redaction. | Did not inspect upstream PR code or remote state, by instruction. |
| Pre-implementation plan review | Task record and implementation plan | No | High/Medium findings or ACCEPT | Done: three Medium findings fixed in the plan/task record before implementation. | No unresolved plan findings. |
| Final docs/security review | Final diff for skill guidance and examples | No | ACCEPT or actionable High/Medium findings | Pending | Not dispatched yet. |

## Progress

- Created local task branch from detached checkout.
- Confirmed no reusable project lessons were returned for this task.
- Created task-state record and implementation plan.
- Pre-implementation review found three valid Medium gaps: full PR-readiness test gate, explicit staged Gitleaks before commit, and avoiding realistic raw secret-shaped example values anywhere in docs. Updated the plan to require `corepack pnpm test`, `gitleaks protect --staged --redact`, and sentinel-only secret examples.
- Updated `plugin/skills/remember/SKILL.md`, `plugin/skills/remember/EXAMPLES.md`, and `plugin/opencode/commands/remember.md` with pre-save sanitization guidance and a placeholder-only security-sensitive example.
- Focused pre-verification: `wc -l` confirmed `plugin/skills/remember/SKILL.md` is 67 lines; `rg -n "ghp_|sk-|Bearer|password=|token=|AKIA|github_pat_|xoxb-" plugin/skills/remember/EXAMPLES.md plugin/skills/remember/SKILL.md plugin/opencode/commands/remember.md` returned no matches.
- Focused text verification passed: `rg -n "secret|credential|redact|REDACTED|preserve" plugin/skills/remember plugin/opencode/commands/remember.md` showed the intended guidance; raw-secret pattern search returned no matches; `git diff --check` passed.
- `corepack pnpm run skills:check` initially hit pnpm ignored-build hardening while materializing dependencies. Per repo instructions, ran `corepack pnpm install --frozen-lockfile --ignore-scripts`, then reran `corepack pnpm run skills:check`; it passed with `Skill lint passed: 15 skills checked.`
- Full test gate passed: `corepack pnpm test` reported 171 test files and 2228 tests passed.
- Security scans so far: `semgrep scan --config p/default --error --metrics=off .` passed with 0 findings; `gitleaks detect --source . --redact --no-git` passed with no leaks in the current worktree. Full-history `gitleaks detect --source . --redact` reported 14 historical leaks across 806 commits, so full-history coverage is not green.
- Dependency setup temporarily added placeholder `allowBuilds` entries to `pnpm-workspace.yaml`; this was task-caused package-manager config churn and was removed. `git diff -- pnpm-workspace.yaml` is empty.
- Codex Security diff scan completed with no findings. Scan report: `/tmp/codex-security-scans/agentmemory/0cd87113_20260617T164703Z/report.md`. It reviewed the three prompt/tooling files plus the two task-state files; validation and attack-path phases were skipped because discovery produced no candidates. Goal usage: 60,955 tokens over about 3.5 minutes.
