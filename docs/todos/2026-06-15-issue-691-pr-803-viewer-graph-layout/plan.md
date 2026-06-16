# Viewer Graph Layout Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use the current repo instructions and keep this scoped to the listed files. This plan is intentionally compact because the task is a PR review/import with a narrow touched surface.

**Goal:** preserve graph node layout and viewport state when the viewer graph is initialized again.

**Architecture:** Keep the existing single-file viewer implementation. Capture the current simulation layout before rebuilding `graphSim.nodes`, then reuse matching node positions and viewport state for unchanged nodes while assigning generated positions to new nodes. Clean up any prior resize handler and animation frame before starting the new graph loop.

**Tech Stack:** TypeScript project, HTML viewer with inline JavaScript, Vitest string-regression tests.

---

## Files

- Modify: `src/viewer/index.html`
- Modify: `test/viewer-graph-cooldown.test.ts`
- Modify: `docs/todos/2026-06-15-issue-691-pr-803-viewer-graph-layout/todo.md`

## Tasks

- [x] Write failing regression assertions in `test/viewer-graph-cooldown.test.ts` for previous layout capture, position reuse, viewport preservation, resize-handler cleanup, and stale animation-frame cancellation.
- [x] Run `npm test -- test/viewer-graph-cooldown.test.ts` and confirm the new assertions fail against current code.
- [x] Update `graphSim` and `initGraph()` in `src/viewer/index.html` to store a resize handler, cancel any active rAF, remove prior resize listener, preserve pan/zoom when a previous layout exists, and reuse x/y/vx/vy for matching nodes.
- [x] Run `npm test -- test/viewer-graph-cooldown.test.ts` and `git diff --check`.
- [x] Perform focused manual security review for viewer-only JavaScript changes: no auth bypass, no new network calls, no storage/persistence changes, no user-controlled script execution, no dependency/supply-chain change, no unbounded new work.
- [x] Run required security gates that apply to a code change when available, and record unavailable tools or blocked checks.
- [x] Update this task record with final decision, verification evidence, caveats, and merge-prep result.

## Self-Review

- Spec coverage: issue-first review, PR inspection, minimal adapted import, tests, security review, neutral local docs, and merge prep are represented.
- Placeholder scan: no TBD/TODO placeholders are present.
- Scope check: all edits stay in viewer HTML, existing viewer test, and this task-state directory.
