# Mesh Project Filter Leak Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `feature-loop` with TDD discipline for this task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent project-scoped mesh sync/export from leaking memories from other projects.

**Architecture:** Centralize mesh project filter normalization and exact row filtering, then apply it consistently to memory/action payloads in mesh push, pull, and REST export. Project-scoped mesh keeps existing omission of semantic, procedural, relations, and graph data because those payload types do not carry `project`.

**Tech Stack:** TypeScript, ESM, iii-sdk function registration, vitest.

---

## Files

- Modify: `src/functions/mesh.ts`
  - Add local helpers for normalized project filtering.
  - Apply helpers in `collectSyncData`.
  - Include `project` in remote pull export URL when `peer.syncFilter.project` is set.
  - Locally post-filter pulled memories/actions before `applySyncData`.
- Modify: `src/triggers/api.ts`
  - Normalize `project` query parameter.
  - Filter mesh-export memories and actions by project when present.
  - Preserve unscoped payload behavior.
- Modify: `test/mesh.test.ts`
  - Add push/pull scoped regression tests and unscoped preservation test.
- Create: `test/api-mesh-export-project.test.ts`
  - Add REST mesh-export project-scope regression tests.
- Modify: `docs/todos/2026-06-13-mesh-project-filter/todo.md`
  - Record verification evidence and final review notes.

## Task 1: Function-Level Mesh Regression Tests

- [x] Add test data helpers in `test/mesh.test.ts` only where they reduce duplication for project-scoped mesh records.
- [x] Add a failing test: `mesh-sync push with syncFilter.project includes only matching memories and actions`.
  - Seed matching, other-project, and unscoped memories/actions.
  - Seed semantic and procedural rows.
  - Register a peer with `syncFilter: { project: "git:repo-main" }` and scopes including memories/actions/semantic/procedural/relations/graph.
  - Run push sync and inspect posted JSON.
  - Expect only matching memory/action IDs.
  - Expect no `semantic`, `procedural`, `relations`, `graphNodes`, or `graphEdges` fields.
- [x] Run: `npm test -- test/mesh.test.ts`
  - Expected before implementation: fail because `mem_other` and `mem_legacy` appear in posted memories.
- [x] Add a failing test: `mesh-sync pull with syncFilter.project requests and applies only matching rows`.
  - Mock remote export with matching, other-project, and unscoped memories/actions.
  - Expect fetch URL contains `project=git%3Arepo-main`.
  - Expect local KV contains only matching pulled memory/action.
- [x] Run: `npm test -- test/mesh.test.ts`
  - Expected before implementation: fail because URL lacks `project` and nonmatching pulled rows are applied.
- [x] Add an unscoped preservation test if current coverage does not prove unscoped push includes memories, semantic, and procedural payloads.

## Task 2: REST Mesh Export Regression Tests

- [x] Create `test/api-mesh-export-project.test.ts` using the existing `registerApiTriggers` mock style from `test/api-memories-project.test.ts`.
- [x] Add a failing test: `mesh-export project filter returns only matching memories and actions`.
  - Seed matching, other-project, and unscoped memories/actions.
  - Seed semantic and procedural rows.
  - Call `api::mesh-export` with `{ project: "git:repo-main" }`.
  - Expect only matching memory/action IDs and no semantic/procedural/relation/graph payload fields.
- [x] Add a preservation test: `mesh-export without project returns full payload`.
  - Expect memories, actions, semantic, and procedural rows appear when no project is supplied.
- [x] Run: `npm test -- test/api-mesh-export-project.test.ts`
  - Expected before implementation: fail because scoped export includes nonmatching and unscoped memories.

## Task 3: Minimal Filtering Implementation

- [x] In `src/functions/mesh.ts`, add:
  - `type ProjectFilter = { scoped: false } | { scoped: true; project?: string }`
  - `normalizeProjectFilter(project?: string): ProjectFilter`
  - `filterByProject<T extends { project?: string }>(items: T[], filter: ProjectFilter): T[]`
- [x] In `collectSyncData`, compute `const projectFilter = normalizeProjectFilter(syncFilter?.project)`.
- [x] Filter both memories and actions with `filterByProject(..., projectFilter)` before delta filtering.
- [x] Keep `projectScoped = projectFilter.scoped` so semantic/procedural/relations/graph remain excluded in scoped mode.
- [x] In pull mode, build the remote export URL with `URL` and append both `since` and encoded `project` when present.
- [x] Before `applySyncData`, post-filter pulled `memories` and `actions` by the same project filter.
- [x] In `src/triggers/api.ts`, add or reuse local helpers to normalize project query and filter memory/action rows.
- [x] In `api::mesh-export`, filter memories and actions by normalized project before delta filtering.
- [x] Treat explicitly blank project filters as scoped-to-none, not unscoped.

## Task 4: Verification

- [x] Run focused tests:
  - `npm test -- test/mesh.test.ts`
  - `npm test -- test/api-mesh-export-project.test.ts`
- [x] Run relevant existing project-scope suite:
  - `npm test -- test/mesh.test.ts test/api-mesh-export-project.test.ts test/api-memories-project.test.ts test/cross-project-isolation.test.ts test/remember-project-scope.test.ts`
- [x] Run broader repo checks as feasible:
  - `npm run build`
  - `npm test`
- [x] Inspect diff:
  - `git diff -- src/functions/mesh.ts src/triggers/api.ts test/mesh.test.ts test/api-mesh-export-project.test.ts docs/todos/2026-06-13-mesh-project-filter/todo.md docs/todos/2026-06-13-mesh-project-filter/plan.md`
- [x] If committing is requested or performed, stage intended files and run:
  - `gitleaks protect --staged --redact`

## Review Notes

The two pre-edit subagents agreed the finding is valid. They also agreed scoped mesh should exclude unscoped legacy rows and keep semantic/procedural rows out of scoped payloads until those types carry a safe project binding.

Prep-merge review gates also accepted the final diff after the blank-project fix: Codex Security diff scan reported no findings, request-code-review security/test/integration lanes reported no critical or important findings, and the replacement final implementation review reported no findings.
