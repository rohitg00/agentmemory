# Issue 483 Viewer I18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe viewer i18n foundation with Chinese localization support for Issue 483 while preserving current fork viewer behavior.

**Architecture:** Keep the viewer self-contained: load locale JSON server-side from checked-in files, inject the active bundle into the existing nonced inline script, and translate selected static/dynamic viewer strings through a small `t()`/`tRaw()` runtime helper. Locale values must not add network calls, external scripts, or unsafe attributes.

**Tech Stack:** TypeScript, Node.js `fs`/`path`, existing static viewer HTML, Vitest.

---

## File Structure

- Modify `src/auth.ts`: add a locale placeholder constant beside the existing viewer nonce placeholder.
- Create `src/viewer/locales.ts`: resolve `VIEWER_LANGUAGE`, load locale JSON from source or dist, sanitize locale names, build active-plus-English fallback bundles.
- Create `src/viewer/locales/en.json`: baseline English strings for translated viewer chrome and proof surfaces.
- Create `src/viewer/locales/zh.json`: Simplified Chinese translations matching English keys.
- Modify `src/viewer/document.ts`: inject locale bundle JSON into the existing nonced viewer script, escaping `<`.
- Modify `src/viewer/index.html`: add locale placeholder assignment, runtime helpers, safe attribute allowlist, static nav/status tags, and focused dynamic strings.
- Modify `package.json`: copy locale JSON into `dist/viewer/locales` during build.
- Create/modify `test/viewer-i18n.test.ts`: TDD coverage for resolution, loading, bundle injection, Chinese selection, and parity.
- Modify `test/viewer-security.test.ts`: assert locale bundle stays inside the existing nonced script and unsafe attributes remain excluded.
- Modify `docs/todos/2026-06-15-issue-483-viewer-i18n/todo.md`: progress and final verification notes.

## Task 1: Write Failing Viewer I18n Tests

- [x] Add `test/viewer-i18n.test.ts` covering:
  - `resolveViewerLanguage()` defaults to `en`.
  - `VIEWER_LANGUAGE=zh-CN` canonicalizes to `zh`.
  - traversal or non-language inputs return no locale from `loadLocale()`.
  - `buildLocaleBundle("zh")` includes Chinese messages and English fallback.
  - `renderViewerDocument()` injects `"lang":"zh"` and Chinese `nav.dashboard`.
  - `renderViewerDocument()` removes the locale placeholder.
  - `zh.json` has every nested leaf path from `en.json`.
- [x] Add a focused security assertion in `test/viewer-security.test.ts` that locale JSON assignment is inside the existing nonced script and the runtime attribute allowlist excludes URL/event-handler attributes.
- [x] Run `npm test -- test/viewer-i18n.test.ts test/viewer-security.test.ts` and record the expected failures from missing implementation.

## Task 2: Implement Locale Loading And Injection

- [x] Add `VIEWER_LOCALE_PLACEHOLDER` to `src/auth.ts`.
- [x] Implement `src/viewer/locales.ts` with `resolveViewerLanguage`, `loadLocale`, and `buildLocaleBundle`.
- [x] Add `src/viewer/locales/en.json` and `src/viewer/locales/zh.json`.
- [x] Update `src/viewer/document.ts` to inject `JSON.stringify(bundle).replace(/</g, "\\u003c")`.
- [x] Update `package.json` build script to copy `src/viewer/locales/*.json`.
- [x] Run `npm test -- test/viewer-i18n.test.ts test/viewer-security.test.ts` and record results.

## Task 3: Wire Viewer Runtime Translation

- [x] Add `window.__AM_LOCALE__ = __AGENTMEMORY_LOCALE__` inside the existing viewer script.
- [x] Add `t()`, `tRaw()`, `applyI18n()`, and a conservative `SAFE_I18N_ATTRS` allowlist.
- [x] Tag header status, nav tabs, theme button text, footer labels, auth prompt labels, and the dashboard loading/error proof surfaces with translations.
- [x] Run `npm test -- test/viewer-i18n.test.ts test/viewer-security.test.ts`.
- [x] Inspect `src/viewer/index.html` for stale locale placeholder and unsafe `data-i18n-attr` use.

## Task 4: Final Verification And Notes

- [x] Run targeted viewer tests.
- [x] Run `npm run build`.
- [x] Run `npm run lint`.
- [x] Run `npm test`.
- [x] Run required security checks for the touched surface.
- [x] Update the task record with command evidence, residual risk, and final PR dispositions.
- [x] Run `$prep-merge-to-local-main`.

Result: prep completed. Created `e437d09ee61248323482ec0184eaeae3ff594c32`, merged captured local `main` commit `6c387b4efea524db5bf8fe0e923958cbcf0213f1` with no conflicts, and verified the post-merge branch.
