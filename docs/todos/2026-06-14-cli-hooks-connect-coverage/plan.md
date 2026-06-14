# CLI Hooks Connect Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise measured CLI/hooks/connect coverage above 80% on the scoped source surface without changing externally visible CLI, auth, or hook behavior.

**Architecture:** Keep behavior stable and increase coverage through direct source tests for helpers/adapters plus smoke tests for generated hook scripts. Where current source files are process entrypoints whose behavior is only safely exercised in subprocesses, add a narrowly scoped coverage command or testable exports only if the diff remains behavior-neutral.

**Tech Stack:** TypeScript ESM, Vitest 4.1.8, V8 coverage, Node subprocess smoke tests, temp directories.

---

## Tasks

- [x] Inspect uncovered lines for `src/hooks/*.ts`, `src/hooks/_http.ts`, `src/cli/connect/index.ts`, low-covered adapters, and `src/cli.ts`.
- [x] Add failing tests for hook HTTP helper boundaries: auth headers, guarded fetch skip, exception-to-stderr path, and no fetch on blocked plaintext bearer URLs.
- [x] Add failing tests for hook entry behavior that can be verified directly without changing runtime semantics: malformed JSON returns, SDK-child guard returns, telemetry hooks do not write stdout, session-end optional fetch fan-out, and context hooks await only when context injection is enabled.
- [x] Reuse existing connect dispatcher and adapter edge tests for not-detected, already-wired, dry-run, backup, and manual-stub behavior; no production connect behavior change was needed.
- [x] Add or calibrate a scoped coverage command/config only if direct tests cannot honestly measure the requested surface through the existing global coverage command.
- [x] Run the focused tests after each behavior slice to verify red then green.
- [x] Run a simplification pass over touched tests/source.
- [ ] Run final verification: targeted CLI/hooks/connect tests, scoped coverage, `npm test`, `npm run coverage`, `npm run build`, `npm run lint`, Semgrep, staged Gitleaks.
- [ ] Commit only scoped changes with a factual commit message.

## Self-Review

- No placeholders: every task names the exact behavior slice and verification direction.
- Spec coverage: smoke/boundary requirements are mapped across hook helper tests, hook entry tests, connect dispatcher/adapter tests, scoped coverage measurement, and final verification.
- Boundary check: behavior changes remain out of scope; any necessary entrypoint seam must preserve generated hook script behavior and CLI output.
