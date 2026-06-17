# Issue 195 Encrypted State Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the current turn for issue #195 by documenting the actual state-at-rest posture and the approval boundary for a real encrypted-storage implementation.

**Architecture:** agentmemory stores durable state through iii-engine's StateModule, reached by `StateKV` through `iii-sdk` `state::*` triggers. This plan does not change that storage boundary; it adds operator-facing documentation and task evidence because app-level encryption would alter security, persistence, and persisted data format boundaries.

**Tech Stack:** TypeScript ESM, iii-sdk/iii-engine file-based state, Markdown docs, pnpm/vitest verification.

---

## Source Of Truth

Spec path: none. The source of truth is the current user request, public fork issue `wbugitlab1/agentmemory#195`, repo-local `AGENTS.md`, and task record `docs/todos/2026-06-17-issue-195-encrypted-state-storage/todo.md`.

Explicit boundary: do not implement encryption, key management, tenant key isolation, migrations, or format changes without current-turn approval. The only approved implementation scope is documentation/design-spike output.

Governing workflow: the current invocation is `github-feature-loop`, so this plan must be reviewed through `review-and-implement` and followed by mandatory local `github-push-prepare`. The generic plan header above is retained for compatibility with the `writing-plans` skill, but it does not authorize skipping the GitHub feature-loop review or prep phases.

GitHub PR prep: mandatory local branch-prep phase after implementation review. Remote fetch, pull, push, PR creation, PR merge, publish, deploy, destructive cleanup, and remote issue updates still require separate explicit approval.

## File Structure

- Modify `README.md`: add a concise note in the Data Directory section that agentmemory does not encrypt iii-engine state files itself and operators needing encrypted-at-rest deployments should place the data directory on encrypted storage while app-level encryption remains a separate approved design.
- Modify `SECURITY.md`: add a Storage Encryption Posture section under Scope so security-conscious operators have one canonical policy location.
- Maintain `docs/todos/2026-06-17-issue-195-encrypted-state-storage/todo.md`: Sprint Contract, evidence, Feature / Verification Matrix, Subagent Ledger, progress, and verification notes.
- Maintain `docs/todos/2026-06-17-issue-195-encrypted-state-storage/plan.md`: this implementation plan.

## Task 1: Document State Storage Posture

**Files:**
- Modify: `README.md`
- Modify: `SECURITY.md`
- Modify: `docs/todos/2026-06-17-issue-195-encrypted-state-storage/todo.md`
- Modify: `docs/todos/2026-06-17-issue-195-encrypted-state-storage/plan.md`

- [ ] **Step 1: Add README Data Directory note**

Insert this paragraph after the `AGENTMEMORY_DATA_DIR` example in `README.md`:

```markdown
agentmemory does not currently encrypt these iii-engine state files itself. For enterprise deployments that require
encryption at rest, place `AGENTMEMORY_DATA_DIR` on an encrypted volume or platform-managed encrypted storage. Adding
application-level encryption, tenant key isolation, or a new encrypted backend would change the storage/data-format
boundary and needs an approved design before implementation.
```

- [ ] **Step 2: Add SECURITY storage posture section**

Insert this section after the `Out of scope` list in `SECURITY.md`:

```markdown
## Storage encryption posture

agentmemory stores durable state through iii-engine's file-based StateModule. The default runtime data directory is
`~/.agentmemory/data`, and the native state files are not encrypted by agentmemory before they are handed to iii-engine.

Deployments that require encryption at rest should put `AGENTMEMORY_DATA_DIR` on encrypted filesystem, disk, volume, or
platform-managed storage and restrict directory permissions to the runtime account. Application-level encryption,
per-tenant keys, encrypted export/import semantics, key rotation, and migration of existing plaintext stores are security
and persistence boundary changes that require an approved design before implementation.
```

- [ ] **Step 3: Update task matrix**

In `docs/todos/2026-06-17-issue-195-encrypted-state-storage/todo.md`, mark the documentation and blocker rows `Done` after the docs are edited and reviewed.

- [ ] **Step 4: Run focused docs whitespace check**

Run:

```bash
git diff --check -- README.md SECURITY.md docs/todos/2026-06-17-issue-195-encrypted-state-storage/todo.md docs/todos/2026-06-17-issue-195-encrypted-state-storage/plan.md
```

Expected: exit code 0, with no whitespace errors.

- [ ] **Step 5: Run storage-path regression tests**

Run:

```bash
corepack pnpm exec vitest run test/engine-launch.test.ts test/build-runtime.test.ts
```

Expected: exit code 0. These tests cover the state directory rendering path that the new docs describe.

- [ ] **Step 6: Commit task-owned files**

After review gates and verification pass, stage only:

```bash
git add README.md SECURITY.md docs/todos/2026-06-17-issue-195-encrypted-state-storage/todo.md docs/todos/2026-06-17-issue-195-encrypted-state-storage/plan.md
```

Then run the required staged secret scan:

```bash
gitleaks protect --staged --redact
```

Expected: exit code 0. If `gitleaks` is unavailable or reports findings, stop and record the blocker or finding before committing.

Then commit:

```bash
git commit -m "docs: clarify state encryption posture"
```

Expected: one commit containing only the task-owned docs and task-state files.

## Self-Review

Spec coverage: the plan covers issue triage, local state evidence, current posture documentation, approval blocker, and focused verification. It intentionally excludes encryption implementation because that crosses security/persistence/data-format boundaries without approval.

Placeholder scan: no placeholder tasks remain; every planned edit and verification command is concrete.

Type consistency: no code types or APIs are introduced. File paths match the task record and repo layout.
