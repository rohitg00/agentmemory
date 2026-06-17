# Remember Skill Secret Redaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the `remember` skill docs so agents redact secrets before calling `memory_save` while preserving non-sensitive operational meaning.

**Architecture:** This is a docs-only agent-workflow change. The skill remains a thin workflow guide around the existing `memory_save` MCP tool; the change adds a sanitization step before that tool call and mirrors the guidance in the OpenCode command.

**Tech Stack:** Markdown skill docs under `plugin/skills`, OpenCode command Markdown under `plugin/opencode/commands`, repo-native skill lint via `corepack pnpm run skills:check`.

---

## Source Of Truth

- Spec path: none.
- Source of truth: user delegation for issue #919, this task record, and current repo evidence.
- PR target context: prepare local branch for a GitHub PR against `origin/main`; do not fetch, push, or create a PR without explicit current-turn approval.

## File Structure

- Modify `plugin/skills/remember/SKILL.md`: add pre-save redaction workflow, replace unconditional phrasing-preservation language, and keep the skill under the 100-line lint limit.
- Modify `plugin/skills/remember/EXAMPLES.md`: add a security-sensitive worked example that redacts an example credential before `memory_save`.
- Modify `plugin/opencode/commands/remember.md`: mirror the sanitization rule for the OpenCode slash command.
- Modify `docs/todos/2026-06-17-issue-919-remember-redact-secrets/todo.md`: keep progress, verification, review, and PR-prep evidence current.

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
| Update `remember` skill workflow | `rg -n "secret|redact|preserve" plugin/skills/remember/SKILL.md`; `corepack pnpm run skills:check` | Done | `plugin/skills/remember/SKILL.md` requires secret inspection, descriptive placeholders, sanitized `content`, and no secret echo; `skills:check` passed. |
| Add safe secret-redaction example | `rg -n "REDACTED|credential|secret|memory_save" plugin/skills/remember/EXAMPLES.md`; raw-secret pattern search; `git diff --check` | Done | `plugin/skills/remember/EXAMPLES.md` uses `[RAW_TOKEN_REDACTED_IN_EXAMPLE]` and `[REDACTED_GITHUB_TOKEN]`; realistic raw-secret pattern search returned no matches; diff checks passed. |
| Align OpenCode command guidance | `rg -n "secret|redact|preserve" plugin/opencode/commands/remember.md` | Done | OpenCode `/remember` now requires redaction before `memory_save`, sanitized content, and no secret echo. |
| Security-sensitive docs diff review | Final review subagents, Gitleaks detect/current-tree, staged Gitleaks before commit, Semgrep, Codex Security diff scan | Done | Final docs/security reviewer ACCEPT; staged `gitleaks protect --staged --redact` passed before commit `77ba2304`; current-tree Gitleaks passed; Semgrep passed with 0 findings; Codex Security diff scan reported no findings. Full-history Gitleaks reported 14 historical leaks not introduced by this patch. |
| Full PR-readiness tests | `corepack pnpm test` | Done | Full non-integration Vitest passed: 171 files, 2228 tests. |
| GitHub push-prep local phase | `github-push-prepare` preflight, local base capture, review chain, staged commit | Done | Local preflight done; branch was clean after commit `77ba2304`; existing local `origin/main` at `0cd8711303473b5cc1cd3ac7fd8739a2d40f8831` was used without fetch; base is already an ancestor of `HEAD`, so integration is a no-op. Follow-up staged Gitleaks passed for task-state reconciliation. |

## Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output | Verification responsibility |
| --- | --- | --- | --- | --- |
| Validity investigation | Current origin checkout and explicit save/skill paths | No | Valid/actionable decision with evidence | Main agent reviews and records result. |
| Pre-implementation plan review | This plan and task record | No | ACCEPT or High/Medium findings | Main agent triages before edits. |
| Final docs/security review | Final diff for `plugin/skills/remember`, `plugin/opencode/commands/remember`, and task docs | No | ACCEPT or High/Medium findings | Main agent triages, fixes valid findings, reruns verification. |

### Task 1: Update Remember Skill Guidance

**Files:**
- Modify: `plugin/skills/remember/SKILL.md`

- [ ] **Step 1: Replace unconditional phrasing-preservation language**

Change the "Why" section so it says to preserve meaning and non-sensitive phrasing, not raw secrets.

- [ ] **Step 2: Add explicit pre-save sanitization workflow**

Insert a workflow step before `memory_save` that requires identifying secrets, credentials, bearer tokens, API keys, passwords, private keys, session cookies, and one-time codes; replace them with descriptive placeholders such as `[REDACTED_GITHUB_TOKEN]`.

- [ ] **Step 3: Update checklist**

Checklist must require that raw secrets are absent from `content`, `concepts`, and `files`, and that confirmation never echoes secret values.

### Task 2: Add Security-Sensitive Example

**Files:**
- Modify: `plugin/skills/remember/EXAMPLES.md`

- [ ] **Step 1: Add a worked example**

Add an example where the user asks to remember an operational note about a token or credential. Do not include a realistic secret value anywhere in the example. Use a non-secret sentinel such as `[RAW_TOKEN_REDACTED_IN_EXAMPLE]` in the user prompt and a descriptive placeholder such as `[REDACTED_GITHUB_TOKEN]` in `memory_save`. The `memory_save` content must preserve the rotation/owner/location/actionable meaning while replacing the raw value with a placeholder.

- [ ] **Step 2: Verify no realistic secret is introduced**

Run `rg -n "ghp_|sk-|Bearer|password=|token=|AKIA|github_pat_|xoxb-" plugin/skills/remember/EXAMPLES.md` and inspect any matches. Expected: no realistic credential value appears anywhere in the example file. Confirm the final diff and Gitleaks output as the stronger check.

### Task 3: Align OpenCode Command

**Files:**
- Modify: `plugin/opencode/commands/remember.md`

- [ ] **Step 1: Add sanitization before save**

Add the same pre-save redaction requirement before the command calls `memory_save`.

- [ ] **Step 2: Replace raw phrasing wording**

Change the `content` bullet so it says to preserve meaning and non-sensitive phrasing, with raw secrets replaced by placeholders.

### Task 4: Verify And Prepare Locally

**Files:**
- Modify: `docs/todos/2026-06-17-issue-919-remember-redact-secrets/todo.md`

- [ ] **Step 1: Run focused text checks**

Run:

```bash
rg -n "secret|credential|redact|REDACTED|preserve" plugin/skills/remember plugin/opencode/commands/remember.md
```

Expected: guidance and example show redaction before save.

- [ ] **Step 2: Run repo-native skill checks**

Run:

```bash
corepack pnpm run skills:check
```

Expected: generated skill references and skill lint pass. If blocked by pnpm hardening, follow repo instructions with `corepack pnpm install --frozen-lockfile --ignore-scripts`, then rerun.

- [ ] **Step 3: Run formatting and security checks**

Run:

```bash
git diff --check
gitleaks detect --source . --redact
semgrep scan --config p/default --error --metrics=off .
corepack pnpm test
```

Expected: no whitespace errors, no secrets, no Semgrep findings, and full non-integration Vitest passes. Record missing-tool, network, pnpm hardening, or runtime blockers if any. Do not claim PR readiness unless `corepack pnpm test` passes or the blocker is explicitly recorded.

- [ ] **Step 4: Run staged secret scan before commit**

After staging only task-owned files and inspecting `git diff --cached --name-status` and `git diff --cached`, run:

```bash
gitleaks protect --staged --redact
```

Expected: no staged leaks. A failure blocks commit until fixed or explicitly accepted.

- [ ] **Step 5: Run local GitHub push-prep phase**

Use `github-push-prepare` local branch-prep mode. Do not fetch, push, or create a PR without explicit current-turn approval. Use existing local `origin/main` only if present and report freshness as unverified.

## Self-Review

- Placeholder scan: no placeholders or undefined destinations remain.
- Acceptance coverage: each requested change maps to a plan task and verification row.
- Scope check: docs-only skill guidance change; runtime sanitization is explicitly out of scope.
- Safety check: no remote reads/writes, upstream PR targeting, dependency changes, or destructive actions are authorized.
