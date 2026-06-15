# Issue 303 Engine Data Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep iii-engine state and stream stores out of the caller's repository by default while allowing an explicit CLI or environment override.

**Architecture:** Add path-resolution and runtime-config rendering helpers near existing CLI runtime helper code, then have `src/cli.ts` generate a runtime iii config before spawning the native engine. Keep the patch focused on data placement and CLI help.

**Tech Stack:** TypeScript ESM, Node filesystem/path/os APIs, Vitest.

---

## Files

- Modify: `src/cli/build-runtime.ts`
- Modify: `src/cli.ts`
- Modify: `test/build-runtime.test.ts`
- Modify: `docs/todos/2026-06-15-issue-303-engine-data-dir/todo.md`

## Tasks

- [x] Write a failing test in `test/build-runtime.test.ts` proving data-dir precedence and runtime config rewriting.
- [x] Run the targeted test and confirm it fails for missing helper behavior.
- [x] Implement minimal helpers in `src/cli/build-runtime.ts`.
- [x] Wire `src/cli.ts` to parse `--data-dir`, export `AGENTMEMORY_DATA_DIR`, and pass a generated runtime config to `iii`.
- [x] Run the targeted test and confirm it passes.
- [x] Run build, lint, full test suite, and required security checks.
- [x] Update `todo.md` with final disposition, commands, residual risk, and merge-prep constraints.
