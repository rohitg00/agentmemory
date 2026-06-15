# Neutralize GitHub Cross References Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent future GitHub cross-references from mirror tooling and neutralize active source references in existing fork issue bodies and comments.

**Architecture:** Keep the existing mirror planners, but change generated markers/source metadata to neutral, non-autolinking forms while preserving parsers for old markers. Add a dedicated repair CLI that works only on existing target issues/comments, plans body/comment PATCH operations, checkpoints reports, and verifies no active source-repo autolinks remain in readable fork content.

**Tech Stack:** TypeScript, Node.js built-ins, GitHub REST API through `gh api`, Vitest, adr-tools.

---

## Task 1: Record Decision

**Files:**
- Modify: `docs/adr/0004-avoid-github-cross-references-in-mirrored-backlog-items.md`
- Modify: `docs/adr/README.md`
- Modify: `docs/todos/2026-06-15-neutralize-github-cross-references/todo.md`

- [x] Replace ADR body with the accepted no-autolink policy.
- [x] Run `/Users/A1538552/_projects/_tools/adr-tools/src/adr generate toc > docs/adr/README.md`.
- [x] Run `/Users/A1538552/_projects/_tools/adr-tools/src/adr list`.
- [x] Record evidence in `todo.md`.

## Task 2: Add Failing Tests

**Files:**
- Modify: `test/issue-mirror.test.ts`
- Modify: `test/upstream-pr-issue-tracker.test.ts`
- Create: `test/github-cross-reference-neutralizer.test.ts`

- [x] Add tests proving issue mirror generated bodies/comments use neutral markers and source metadata.
- [x] Add tests proving old issue mirror markers remain parseable.
- [x] Add tests proving PR tracker generated bodies use neutral markers and source metadata.
- [x] Add tests proving old and already-neutral PR markers remain parseable.
- [x] Add tests for a pure neutralizer helper that rewrites old markers, source URLs, and source repo references without changing unrelated text.
- [x] Run the targeted tests and confirm they fail for the missing behavior.

## Task 3: Implement Neutral Markers And Sanitization

**Files:**
- Modify: `scripts/github/issue-mirror.ts`
- Modify: `scripts/github/upstream-pr-issue-tracker.ts`

- [x] Change generated issue/PR/comment/overflow/summary markers to neutral forms that avoid `owner/repo#N`.
- [x] Replace generated `Source: https://github.com/...` and `Source comment: https://github.com/...` lines with source repository, source number, and URL-omitted fields.
- [x] Extend old-marker parsers to parse both old autolinking markers and new neutral markers.
- [x] Keep validation checks strict enough to reject source-repo GitHub URLs and `owner/repo#N` in generated payloads.
- [x] Run targeted tests until green.

## Task 4: Add Repair CLI

**Files:**
- Create: `scripts/github/github-cross-reference-neutralizer.ts`
- Create: `scripts/github/neutralize-github-cross-references.ts`
- Modify: `test/github-cross-reference-neutralizer.test.ts`

- [x] Implement `neutralizeGithubCrossReferences(text, sourceRepo)` as a pure helper returning changed text and counts.
- [x] Implement dry-run/apply/verify CLI modes with `--source`, `--target`, `--report`, `--confirm-credentialed-reads`, `--confirm-remote-writes`, and `--write-delay-ms`.
- [x] Read all target issues and existing comments via `gh api`; do not read or write upstream.
- [x] In apply mode, PATCH only changed issue bodies/comments and checkpoint after each successful write.
- [x] In verify mode, exit nonzero if any active source-repo autolink remains.
- [x] Run targeted tests until green.

## Task 5: Apply Remote Repair

**Files:**
- Create/update reports under `docs/todos/2026-06-15-neutralize-github-cross-references/`
- Modify: `docs/todos/2026-06-15-neutralize-github-cross-references/todo.md`

- [x] Run repair dry-run and inspect counts.
- [x] Run repair apply with current-turn confirmation flags and a conservative write delay.
- [x] Confirm no GitHub rate-limit checkpoint was needed; if future rate-limits occur, stop, record the checkpoint, and resume from a fresh dry-run later.
- [x] Run repair verify and require zero active source autolink matches.
- [x] Record evidence and residual risk that upstream historical timeline events may remain.
