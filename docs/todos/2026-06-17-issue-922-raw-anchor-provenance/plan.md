# Raw-Anchor Provenance Sidecar Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a reviewed design for a privacy-safe raw-anchor provenance sidecar that can later make `memory_verify` auditable when source observations are missing.

**Architecture:** This plan is documentation-only. It records a proposed contract in task-local design docs and, if warranted, an ADR. It deliberately avoids runtime schema, export/import, REST, MCP, migration, and deletion behavior changes until the design is reviewed.

**Tech Stack:** Markdown design docs, TypeScript source inspection, Vitest/source references, GitHub feature-loop local branch preparation.

---

## Source Of Truth

No separate approved spec exists. The source of truth is the user's issue #922 request, this task record, the subagent validity report, and current repo evidence:

- `src/functions/verify.ts`: current `memory_verify` implementation.
- `test/verify.test.ts`: current verify coverage.
- `src/functions/remember.ts`: `sourceObservationIds` persistence and forget behavior.
- `src/functions/observe.ts` and `src/functions/privacy.ts`: observation capture and redaction posture.
- `src/state/schema.ts`: KV scope definitions.
- `src/types.ts`: persisted/exported data types and audit operation union.
- `src/functions/export-import.ts`: export/import known-scope handling and replace semantics.
- `src/functions/governance.ts` and `src/functions/audit.ts`: deletion/governance and audit policy.
- `src/triggers/api.ts` and `src/mcp/server.ts`: REST/MCP boundary shapes for verify/delete.

## File Structure

- Modify: `docs/todos/2026-06-17-issue-922-raw-anchor-provenance/todo.md`
  - Track Sprint Contract, matrix, subagent ledger, progress, verification, and final review notes.
- Create: `docs/todos/2026-06-17-issue-922-raw-anchor-provenance/spec.md`
  - Design the sidecar schema and lifecycle.
- Create: `docs/adr/0006-design-redacted-provenance-sidecar-for-memory-verify.md`
  - Record the durable architecture decision if the design chooses the sidecar path.
- Modify: `docs/adr/README.md`
  - Add ADR 0006 to the table of contents if ADR 0006 is created.

No production code, tests, package metadata, generated docs, plugin metadata, or runtime docs are planned.

## Task 1: Draft The Design Spec

**Files:**
- Create: `docs/todos/2026-06-17-issue-922-raw-anchor-provenance/spec.md`
- Modify: `docs/todos/2026-06-17-issue-922-raw-anchor-provenance/todo.md`

- [ ] **Step 1: Write the design spec**

Create `spec.md` with these sections and concrete decisions:

```markdown
# Raw-Anchor Provenance Sidecar Design

## Problem
## Decision Summary
## Current Behavior Evidence
## Proposed Data Model
## Write Path
## Verify Response Shape
## Privacy And Retention
## Deletion And Governance
## Export, Import, And Migration
## Audit Operations
## Backward Compatibility
## Acceptance Tests
## Non-Goals
## Open Follow-Ups
```

Expected design choices:
- New KV scope proposed as `KV.provenanceAnchors = "mem:provenance:anchors"` with key `memoryId`.
- New interface proposed as `MemoryProvenanceAnchor` with redacted anchor metadata only.
- Sidecar stores observation IDs, session IDs, timestamps, bounded already-compressed metadata, redaction/version metadata, and one aggregate local-HMAC content fingerprint by default, but not raw prompts, tool inputs, tool outputs, assistant responses, or full raw observations.
- `memory_verify` remains backward-compatible and adds optional fields such as `sourceResolution`, `sourceAnchors`, and `provenanceStatus`.
- Deletion/governance default is to delete sidecars with memories, retain redacted sidecars when observations are deleted unless an explicit provenance purge is requested, and record audit details.
- Export/import includes the sidecar in a new optional `provenanceAnchors` field only after version bump and size validation.
- Migration is additive and lazy or opt-in; no backfill from raw logs is required.

- [ ] **Step 2: Update progress and matrix**

Update `todo.md` with:

```markdown
- Drafted `spec.md` with sidecar schema, privacy, deletion/governance, export/import, migration, REST/MCP response, audit, and test design.
```

Mark the design matrix row as in review.

## Task 2: Record The Durable Decision

**Files:**
- Create: `docs/adr/0006-design-redacted-provenance-sidecar-for-memory-verify.md`
- Modify: `docs/adr/README.md`
- Modify: `docs/todos/2026-06-17-issue-922-raw-anchor-provenance/todo.md`

- [ ] **Step 1: Create ADR 0006**

Create an ADR with:

```markdown
# 6. Design redacted provenance sidecar for memory_verify

Date: 2026-06-17

## Status

Accepted

## Context
...

## Decision
...

## Consequences
...
```

The ADR must say the project will design the future implementation around a redacted sidecar, but this task does not implement the KV scope, type, export/import field, migration, or verify response changes.

- [ ] **Step 2: Update the ADR table of contents**

Add:

```markdown
* [6. Design redacted provenance sidecar for memory_verify](0006-design-redacted-provenance-sidecar-for-memory-verify.md)
```

- [ ] **Step 3: Update task state**

Record the ADR path and mark ADR decision complete in the matrix.

## Task 3: Review And Revise The Design

**Files:**
- Read/modify: `docs/todos/2026-06-17-issue-922-raw-anchor-provenance/spec.md`
- Read/modify: `docs/adr/0006-design-redacted-provenance-sidecar-for-memory-verify.md`
- Read/modify: `docs/todos/2026-06-17-issue-922-raw-anchor-provenance/todo.md`

- [ ] **Step 1: Run read-only design review subagent**

Dispatch a read-only reviewer with this prompt:

```text
Review the raw-anchor provenance sidecar design in docs/todos/2026-06-17-issue-922-raw-anchor-provenance/spec.md and docs/adr/0006-design-redacted-provenance-sidecar-for-memory-verify.md.

Worktree: /Users/A1538552/.codex/worktrees/329c/agentmemory
Read-only. Do not edit, stage, commit, switch branches, fetch, pull, push, delete, run migrations, install dependencies, or call remote APIs.

Focus on High/Medium issues only:
- privacy/retention risks, especially raw prompt/tool payload storage
- schema/export/import/migration gaps
- deletion/governance ambiguity
- REST/MCP backward-compatibility risk
- tests missing for missing/deleted/exported/imported source cases
- mismatch with current source files

Return ACCEPT or findings with file/line evidence, impact, recommendation, confidence, commands run, and residual uncertainty.
```

- [ ] **Step 2: Triage findings and revise**

Classify each finding as `fixed`, `false_positive`, `out_of_scope`, `accepted_risk`, or `needs_user_decision`. Fix only valid findings that stay within the design-only scope. Stop if a finding requires a runtime schema/API/privacy decision beyond the documented design.

- [ ] **Step 3: Record review result**

Update `todo.md` with the review summary and triage table.

## Task 4: Verify The Design Docs

**Files:**
- Verify: `docs/todos/2026-06-17-issue-922-raw-anchor-provenance/spec.md`
- Verify: `docs/adr/0006-design-redacted-provenance-sidecar-for-memory-verify.md`
- Verify: source files listed in Source Of Truth
- Modify: `docs/todos/2026-06-17-issue-922-raw-anchor-provenance/todo.md`

- [ ] **Step 1: Run source/doc consistency searches**

Run:

```bash
rg -n "provenanceAnchors|MemoryProvenanceAnchor|sourceResolution|provenanceStatus|raw prompt|tool input|tool output|ExportData|AuditEntry|mem::verify|memory_verify" docs/todos/2026-06-17-issue-922-raw-anchor-provenance docs/adr src/functions/verify.ts src/functions/remember.ts src/functions/export-import.ts src/functions/governance.ts src/functions/audit.ts src/state/schema.ts src/types.ts src/triggers/api.ts src/mcp/server.ts test/verify.test.ts
```

Expected: docs include the proposed names and boundaries; source references confirm those are proposed, not implemented.

- [ ] **Step 2: Run markdown/source sanity checks**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 3: Update final task state notes**

Update `todo.md` with verification evidence, caveats, and residual risks.

## Task 5: GitHub Push-Prep Local Phase

**Files:**
- Stage/commit only:
  - `docs/todos/2026-06-17-issue-922-raw-anchor-provenance/todo.md`
  - `docs/todos/2026-06-17-issue-922-raw-anchor-provenance/plan.md`
  - `docs/todos/2026-06-17-issue-922-raw-anchor-provenance/spec.md`
  - `docs/adr/0006-design-redacted-provenance-sidecar-for-memory-verify.md`
  - `docs/adr/README.md`

- [ ] **Step 1: Run local branch preflight**

Run:

```bash
git status -sb --untracked-files=all
git branch --show-current
git worktree list --porcelain
git diff --cached --name-status
git remote -v
```

Expected: on `issue/922-raw-anchor-provenance`, no staged changes before staging, remotes include fork `origin` and upstream `upstream`.

- [ ] **Step 2: Capture local PR base without fetch**

Run:

```bash
base_sha=$(git rev-parse --verify refs/remotes/origin/main^{commit})
merge_base=$(git merge-base HEAD "$base_sha")
git log --oneline --decorate --left-right --max-count=20 HEAD..."$base_sha"
git diff --name-status "$merge_base"...HEAD
```

Expected: base resolves from existing local `origin/main`; freshness remains unverified because fetch is not approved.

- [ ] **Step 3: Run security and review gates appropriate for docs/design**

Run:

```bash
rg -n "raw prompt|raw tool|tool input|tool output|assistantResponse|migration|delete|export|import|memory_verify" docs/todos/2026-06-17-issue-922-raw-anchor-provenance docs/adr/0006-design-redacted-provenance-sidecar-for-memory-verify.md
git diff -- docs/todos/2026-06-17-issue-922-raw-anchor-provenance docs/adr/0006-design-redacted-provenance-sidecar-for-memory-verify.md docs/adr/README.md
```

Expected: design explicitly rejects raw payload storage by default and keeps runtime changes out of scope.

- [ ] **Step 4: Stage task-owned files and run staged secret scan**

Run:

```bash
git add docs/todos/2026-06-17-issue-922-raw-anchor-provenance/todo.md docs/todos/2026-06-17-issue-922-raw-anchor-provenance/plan.md docs/todos/2026-06-17-issue-922-raw-anchor-provenance/spec.md docs/adr/0006-design-redacted-provenance-sidecar-for-memory-verify.md docs/adr/README.md
git diff --cached --name-status
gitleaks protect --staged --redact
```

Expected: only task-owned docs are staged; gitleaks reports no leaks. If `gitleaks` is missing, record the blocker and do not commit.

- [ ] **Step 5: Commit**

Run:

```bash
git commit -m "docs: design memory verify provenance sidecar"
```

Expected: commit succeeds and contains only task-owned docs.

- [ ] **Step 6: Confirm base integration state**

Run:

```bash
git status --porcelain=v1 -uall
base_sha=$(git rev-parse --verify refs/remotes/origin/main^{commit})
git merge-base --is-ancestor "$base_sha" HEAD
git diff --name-status "$base_sha"...HEAD
```

Expected: clean worktree; local `origin/main` is already an ancestor or no base merge is required. Do not fetch, pull, push, or create a PR.

## Self-Review

- Spec coverage: this plan covers validity, task state, design spec, ADR, privacy/retention, schema/export/import/migration, REST/MCP response compatibility, audit, deletion/governance, acceptance tests, review, verification, local commit, and local PR-prep boundaries.
- Placeholder scan: no TBD/TODO placeholders are used as implementation instructions.
- Type consistency: proposed names are intentionally documented as future design names and are not claimed to exist in source.
