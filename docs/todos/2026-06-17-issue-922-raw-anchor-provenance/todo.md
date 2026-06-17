# Issue 922 Raw-Anchor Provenance Sidecar

## Scope

- Repository: `/Users/A1538552/.codex/worktrees/329c/agentmemory`
- Branch: `issue/922-raw-anchor-provenance`
- Target issue: `wbugitlab1/agentmemory#922`
- Task type: design evaluation for `memory_verify` raw-anchor provenance sidecar
- PR target: `origin/main` from the existing local remote-tracking ref unless fetch is explicitly approved

## Validity Decision

Decision: valid and actionable as a design-only task.

Evidence:
- `src/functions/verify.ts` resolves `Memory.sourceObservationIds` by scanning live observation rows and returns citations only for observations it can still find.
- `src/state/schema.ts` has no provenance sidecar KV scope.
- `src/types.ts` `ExportData` enumerates export/import scopes and has no sidecar field.
- `src/functions/export-import.ts` exports/imports known scopes explicitly, so any sidecar needs deliberate export/import handling.
- `src/functions/remember.ts` stores only filtered `sourceObservationIds` on memories.
- `src/functions/governance.ts` and `src/functions/remember.ts` delete memories/observations without any independent provenance sidecar cleanup or retention rule.
- The issue context says #241 added resolved/incomplete/absent status, but this checkout does not include those fields in `verify.ts` or `test/verify.test.ts`.

Subagent validity result: `VALID/ACTIONABLE as a design-only task first`; the subagent inspected verify, remember, observe, privacy, export/import, governance, schema, types, API, MCP, index, README, and related tests.

## Sprint Contract

Goal: evaluate and design a redacted raw-anchor provenance sidecar for stronger `memory_verify` auditability without changing persisted schema or runtime behavior.

Scope:
- Create a task-local design spec that defines the proposed sidecar schema, privacy/retention rules, export/import behavior, migration posture, REST/MCP response compatibility, audit operations, deletion/governance behavior, and acceptance tests.
- Create an ADR only if the design reaches a durable architecture decision.
- Update task state with evidence, review notes, verification, and GitHub feature-loop boundaries.

Non-goals:
- No runtime code changes.
- No persisted schema/KV changes.
- No new REST or MCP behavior.
- No raw prompt, raw tool input, raw tool output, or full observation payload storage by default.
- No dependency, package, generated reference, plugin metadata, migration, publish, deploy, fetch, pull, push, PR creation, or upstream `rohitg00/agentmemory` targeting.

Acceptance criteria:
- Validity is documented with repo evidence and subagent evidence.
- The design chooses whether the sidecar should use a new KV scope, export/import field, migration, audit operations, and deletion/governance semantics.
- The design defines privacy-safe raw anchors that are independently useful when observations are missing or deleted, without storing raw prompt/tool payloads by default.
- The design defines backward-compatible `memory_verify` response additions.
- The design lists tests for live, missing, deleted, exported, and imported source cases.
- Verification proves the design docs are internally consistent and anchored to current source files.

Known boundaries:
- Persisted schema, API response shape, privacy/retention behavior, and deletion/governance behavior are externally visible boundaries. This task documents a proposed contract only.
- `git fetch`, `git pull`, `git push`, PR creation, remote issue/PR writes, publishing, migration, and destructive cleanup require separate explicit current-turn approval.
- The worktree started detached at `0cd87113`; local branch `issue/922-raw-anchor-provenance` was created before edits.
- Existing local `refs/remotes/origin/main` is `0cd8711303473b5cc1cd3ac7fd8739a2d40f8831`; no fetch has been run, so freshness is unverified.

Stop conditions:
- Implementation would require a schema, migration, API, auth/security, privacy/retention, export/import, dependency, or remote-state change.
- Source inspection shows an existing approved raw-anchor sidecar design already covers this issue.
- Review finds the proposed design stores raw prompt/tool payloads by default or cannot satisfy deletion/governance expectations.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Validate issue actionability | Main-agent source inspection plus read-only subagent investigation | Done | Current source lacks a sidecar and live-observation-independent provenance; subagent decision was valid/actionable as design-only. |
| Create Sprint Contract and plan | Inspect task record and plan | Done | `todo.md` and `plan.md` created under this task directory. |
| Draft raw-anchor design | Self-review, source cross-check, subagent design review | Done | `spec.md` drafted and revised with sidecar schema, aggregate-HMAC privacy contract, deletion/governance paths, export/import pagination behavior, migration, REST/MCP response, audit, and test design. |
| Decide ADR need | Compare design with durable architecture docs | Done | ADR 0006 records the durable design direction because storage, export/import, and governance architecture are affected. |
| Verify design docs | `rg` source/doc checks plus markdown/source review | Done | Source/doc consistency searches found proposed names and source anchors; `git diff --check` passed. |
| GitHub push-prep local phase | Local branch prep, review gates, staged secret scan, commit, base check | Done | Design commit `ec81e3fd` plus a follow-up task-state evidence commit; local base is ancestor, worktree checks complete, no push/PR performed. |

## Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output | Result | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Validity investigation | `memory_verify`, provenance, export/import, privacy, deletion/governance source and tests | No | Valid/actionable decision with files inspected, commands run, evidence, uncertainties | Complete: valid/actionable as design-only; no edits or remote actions. | Checkout may not contain the issue's claimed #241 option-1 fields. |
| Design review | Task design spec/ADR after draft | No | High/Medium findings or ACCEPT, focused on privacy, schema, export/import, deletion/governance, response compatibility | Complete: three Medium findings fixed. | Residual implementation risk remains for the future schema/API change, not this design-only task. |

## Progress

- Created local branch `issue/922-raw-anchor-provenance` from detached `0cd87113`.
- Confirmed worktree was clean before edits.
- Public GitHub issue page was not available through the web fetch/search path; using user-provided issue text plus local repo evidence.
- Completed read-only subagent validity investigation.
- Drafted `spec.md` with sidecar schema, privacy, deletion/governance, export/import, migration, REST/MCP response, audit, and test design.
- Added ADR 0006 and updated `docs/adr/README.md`.
- Design review found three Medium issues and all were fixed:
  - Export sidecar selection now respects current session-based pagination and omits sidecars from paginated export by default.
  - Deletion/governance coverage now names `mem::governance-bulk`, `mem::auto-forget`, `mem::evict`, and `mem::retention-evict`.
  - Fingerprints now default to one aggregate local-HMAC fingerprint with input bounds instead of deterministic per-fact hashes.
- Verification:
  - `rg -n "provenanceAnchors|MemoryProvenanceAnchor|sourceResolution|provenanceStatus|raw prompt|tool input|tool output|ExportData|AuditEntry|mem::verify|memory_verify" ...` confirmed the design names are documented and source references remain proposals, not implemented behavior.
  - `rg -n "raw prompt|raw tool|tool input|tool output|assistantResponse|migration|delete|export|import|memory_verify|auto-forget|retention-evict|governance-bulk|local HMAC|paginated export" ...` confirmed privacy, deletion, export/import, and migration boundaries are explicit.
  - `git diff --check` passed.
- Final read-only implementation review: ACCEPT. Reviewer found no Critical/Important actionable issue in the docs-only design surface and confirmed scope/non-goals, raw-payload rejection, deletion/governance/export/import/migration coverage, backward compatibility, and ADR design-only wording.
- GitHub push-prep preflight:
  - `git branch --show-current`: `issue/922-raw-anchor-provenance`.
  - `git worktree list --porcelain`: current worktree is on `refs/heads/issue/922-raw-anchor-provenance`; other user-managed worktrees preserved.
  - `git diff --cached --name-status`: empty before staging.
  - `git remote -v`: `origin` is `https://github.com/wbugitlab1/agentmemory.git`; `upstream` is `https://github.com/rohitg00/agentmemory.git`.
  - Existing local PR base `refs/remotes/origin/main` is `0cd8711303473b5cc1cd3ac7fd8739a2d40f8831`; merge base is the same commit. No fetch was run, so freshness is unverified.
- Staging and commit:
  - Staged only `docs/adr/0006-design-redacted-provenance-sidecar-for-memory-verify.md`, `docs/adr/README.md`, and this task directory's `plan.md`, `spec.md`, and `todo.md`.
  - `gitleaks protect --staged --redact` passed with no leaks.
  - Created commit `ec81e3fd docs: design memory verify provenance sidecar`.
- Post-commit verification:
  - `git status -sb --untracked-files=all`: clean on `issue/922-raw-anchor-provenance`.
  - `git merge-base --is-ancestor refs/remotes/origin/main HEAD`: exit 0 against local base `0cd8711303473b5cc1cd3ac7fd8739a2d40f8831`; no base merge required.
  - `git diff --name-status refs/remotes/origin/main...HEAD`: only the ADR, ADR index, and task-state docs.
  - `git diff --check HEAD~1..HEAD`: passed.
  - `gitleaks detect --source . --redact --log-opts=HEAD~1..HEAD`: passed with no leaks in the task commit.
  - `gitleaks detect --source . --redact`: found 14 leaks across existing repository history; the staged and task-commit scans passed, so this is recorded as pre-existing history risk outside the task-owned diff.
  - `semgrep scan --config p/default --error --metrics=off .`: passed, 705 tracked targets scanned, 0 findings.

## Final Review Notes

- Sprint Contract status: met for design-only scope. No runtime code, schema, API, dependency, migration, or remote state changed.
- Feature / Verification Matrix status: all rows complete after final task-state commit.
- Review status: validity subagent returned valid/actionable design-only; design reviewer found three Medium issues, all fixed; final reviewer returned ACCEPT.
- Security gate status: staged and task-commit Gitleaks scans passed; full-history Gitleaks has pre-existing findings outside this task; Semgrep passed with 0 findings.
- GitHub push-prep result: local branch prepared against existing local `origin/main`; no fetch was run, so remote freshness is unverified. No push or PR creation was performed.
- Preserved unrelated dirty paths: none in this worktree.
