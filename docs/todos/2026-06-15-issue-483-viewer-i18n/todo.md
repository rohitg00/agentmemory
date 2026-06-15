# Issue 483 Viewer I18n Task

Scope: repository worktree `/Users/A1538552/.codex/worktrees/1e20/agentmemory` on branch `review/issue-483-pr-673-viewer-i18n`.

## Sprint Contract

Goal: decide and, if appropriate, adapt the smallest safe viewer localization fix for Issue 483.

Scope:
- Issue 483 viewer UI i18n behavior.
- Candidate PRs 673 and 541.
- Viewer document rendering, viewer static HTML, locale assets, and focused tests if a fix is adapted.

Non-goals:
- No pushes, PR creation, remote issue updates, or logged-in API/browser reads.
- No route, auth, persistence, schema, MCP, REST endpoint, hook, dependency, or package-manager behavior changes beyond what is required to serve viewer locale files safely.
- No broad upstream import or unrelated release-note churn.

Acceptance criteria:
- Issue behavior is classified against the current fork.
- PR 673 and PR 541 are compared by files, diff size, fit, and security posture.
- If adapted, Chinese viewer localization can be selected with `VIEWER_LANGUAGE=zh`, safely falls back to English, and does not weaken CSP/nonced-script behavior.
- Task notes record the issue disposition, PR dispositions, fork decision, baseline evidence, security assessment, commands, and residual risk.
- `$prep-merge-to-local-main` runs at the end and records no-op/skipped work or commit/merge evidence as applicable.

Intended verification:
- Targeted failing test before production code.
- Targeted viewer i18n/security tests after implementation.
- `npm run build`.
- `npm run lint`.
- `npm test` because viewer document/static code is shared.
- Security gates required by scope: Semgrep for non-trivial code/config change, OSV if dependency or lockfile surfaces change, Gitleaks before commit.

Known boundaries:
- Public unauthenticated upstream reads are permitted by the task. `gh api`, token-backed reads, logged-in browser/API reads, pushes, PRs, and remote issue/label writes are not permitted without current-turn approval.
- Locale JSON is community-maintained content, so injection must remain inside the existing nonced viewer script and escape script-breaking characters.
- `data-i18n-attr` must be allowlisted if implemented; no translated `href`, `src`, event handler, or IDREF attributes.
- Build script may be updated only to copy checked-in locale JSON into `dist`; no new dependencies.

Stop conditions:
- A candidate requires changing auth, REST/MCP exposure, schema/persistence, dependencies, or external services.
- Correct conflict resolution would require deleting or overwriting unrelated current fork viewer behavior.
- Verification repeatedly fails without an understood failure mode.

## Baseline Evidence

- `git status -sb --untracked-files=all`: clean branch after branch creation.
- Current fork has no `src/viewer/locales.ts`, no `src/viewer/locales/`, no `VIEWER_LANGUAGE`, and no `window.__AM_LOCALE__`.
- Issue 483 public body requests viewer UI i18n for port 3113, starting with Chinese; issue is open and has no comments.
- PR 541 is open, 13 files, 1250 additions, 192 deletions, changed-file report shows English and German locale framework only. It does not ship Chinese localization.
- PR 673 is open, 13 files, 1616 additions, 195 deletions, changed-file report shows English, German, and Chinese locales. It states it builds on PR 541.
- `git apply --check` failed for both PR patches against this fork. `git apply --3way --check` showed partial applicability but conflicts in current viewer/changelog drift.

## Candidate Comparison

| Candidate | Disposition | Evidence | Fork decision |
| --- | --- | --- | --- |
| PR 541 | reject for this issue | Adds i18n framework and English/German locales but not Chinese; does not satisfy the "starting with Chinese" request by itself. | Use as context only. |
| PR 673 | adapt | Adds Chinese locale and the needed framework, but patch is stale against current fork and includes unrelated release-note/changelog churn. | Adapt minimal viewer i18n pieces without broad upstream import. |

## Security Assessment

- Auth and REST proxy behavior should remain unchanged.
- No new network calls or external services are needed.
- No dependency or lockfile changes are expected.
- Main security risks are script injection through translation strings and unsafe translated attributes.
- Required mitigations: JSON injection escapes `<`; UI translations inserted into HTML-producing code are escaped; attribute translation is allowlisted; tests cover CSP/nonced-script placement and unsafe attribute exclusion.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue/PR classification | Public unauthenticated issue and PR reads, local code search | done | Issue 483 and PR 541/673 metadata inspected; current fork lacks viewer i18n. |
| Locale loader and bundle | Targeted failing test then implementation | pending |  |
| Viewer document injection | Targeted failing test then implementation | pending |  |
| Viewer static/dynamic translation support | Targeted test plus focused source inspection | pending |  |
| Chinese locale coverage | Locale parity and `VIEWER_LANGUAGE=zh` tests | pending |  |
| Security posture | Targeted security tests plus Semgrep/Gitleaks as required | pending |  |
| Merge prep | `$prep-merge-to-local-main` | pending |  |

## Commands

- `git switch -c review/issue-483-pr-673-viewer-i18n`
- `rg -n "Issue 483|PR 673|PR 541|i18n|locale|localization|VIEWER_LANGUAGE|Chinese|中文|language" .`
- `curl -fsSL` public GitHub API reads for Issue 483, PR 673, PR 541, and their file lists.
- `git apply --stat /tmp/agentmemory-pr673.patch`
- `git apply --stat /tmp/agentmemory-pr541.patch`
- `git apply --check /tmp/agentmemory-pr673.patch`
- `git apply --check /tmp/agentmemory-pr541.patch`
- `git apply --3way --check /tmp/agentmemory-pr673.patch`
- `git apply --3way --check /tmp/agentmemory-pr541.patch`

## Implementation Notes

- `review-and-implement` could not be followed literally because the available subagent tool policy only permits spawning when the user explicitly asks for subagents or parallel agent work. Continued inline and kept the plan/task record updated.
- Created an ignored `node_modules` symlink to `/Users/A1538552/_projects/_tools/agentmemory/node_modules` after the first targeted test run failed with `vitest: command not found`. The symlink is a local verification artifact, not a task-owned source change.
- Red test evidence:
  - `npm test -- test/viewer-i18n.test.ts test/viewer-security.test.ts` initially failed after symlink setup because `../src/viewer/locales.js` did not exist and the rendered viewer document had no locale bundle or safe attribute allowlist.
- Adapted PR 673 minimally:
  - Added `src/viewer/locales.ts` with language canonicalization, safe locale-name validation, JSON locale loading, and English fallback bundle generation.
  - Added `src/viewer/locales/en.json` and `src/viewer/locales/zh.json`.
  - Injected locale JSON through the existing nonced viewer script with `<` escaped.
  - Added `t`, `tRaw`, `applyI18n`, and a conservative `SAFE_I18N_ATTRS` allowlist in `src/viewer/index.html`.
  - Localized core viewer chrome, WebSocket status text, auth prompt text, dashboard loading text, and dashboard error proof surfaces.
  - Updated the build script to copy checked-in locale JSON files to `dist/viewer/locales`.
- Did not import upstream changelog, German locale, or broad dynamic-viewer string rewrites from PR 541/673.

## Verification Evidence

- `npm test -- test/viewer-i18n.test.ts test/viewer-security.test.ts`: pass, 2 files, 29 tests.
- Cleanup rerun after the final i18n polish: `npm test -- test/viewer-i18n.test.ts test/viewer-security.test.ts`: pass, 2 files, 29 tests.
- `npm run build`: pass. Existing tsdown warnings about deprecated `external`/`inlineOnly`, plugin timings, and ineffective dynamic imports remained; build also produced ignored `dist/` output and ignored plugin script map/declaration artifacts.
- `npm run lint`: pass.
- `npm test`: first full rerun after the security cleanup failed three unrelated tests by 10s timeout; direct rerun of those three files passed, 3 files, 26 tests.
- Final full rerun: `npm test`: pass, 158 files, 1987 tests.
- `semgrep scan --config p/default --error --metrics=off .`: pass, 0 findings, 558 tracked files scanned.
- `osv-scanner scan source .`: failed because no package sources were found.
- `osv-scanner scan source -r --allow-no-lockfiles .`: pass, no package sources found, no issues found.
- `git diff --check`: pass.
- `$requesting-code-review`: independent read-only reviewer returned ACCEPT with one non-blocking minor UI finding; fixed by removing static `data-i18n` from the dynamic theme toggle.
- `codex-security:security-diff-scan`: pass, no findings. Markdown report: `/tmp/codex-security-scans/agentmemory/local_patch_20260615215635/report.md`; HTML report: `/tmp/codex-security-scans/agentmemory/local_patch_20260615215635/report.html`.
- `$prep-merge-to-local-main`: current preflight resolved local `main` to `6c387b4efea524db5bf8fe0e923958cbcf0213f1`; listed main worktree is clean and points at that commit. Incoming local-main paths are unrelated ADR/docs/github tracking changes.
- Task-created local artifact: the untracked `node_modules` symlink used for test execution was removed after explicit approval before staging.

## Updated Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Issue/PR classification | Public unauthenticated issue and PR reads, local code search | done | Issue 483 and PR 541/673 metadata inspected; current fork lacked viewer i18n. |
| Locale loader and bundle | Targeted failing test then implementation | done | Red failure on missing `src/viewer/locales.js`; green targeted test run passed. |
| Viewer document injection | Targeted failing test then implementation | done | Red failure on missing `window.__AM_LOCALE__`; green targeted security/i18n tests passed. |
| Viewer static/dynamic translation support | Targeted test plus focused source inspection | done | Core chrome/status/auth/dashboard proof surfaces use locale helpers; full dynamic UI coverage remains residual risk. |
| Chinese locale coverage | Locale parity and `VIEWER_LANGUAGE=zh` tests | done | `zh-CN` canonicalizes to `zh`; rendered document contains Chinese dashboard label; locale parity tests pass. |
| Security posture | Targeted security tests plus Semgrep/Gitleaks as required | partial | Security tests, Semgrep, OSV, security diff scan, and `git diff --check` passed; staged Gitleaks still pending before commit. |
| Merge prep | `$prep-merge-to-local-main` | in progress | Preflight passed after local `main` became clean; staging, Gitleaks, commit, local-main merge, and post-merge verification pending. |

## Residual Risk

- Full viewer string coverage is large because `src/viewer/index.html` contains many dynamic HTML builders. The adapted fix should prioritize a safe, testable framework plus core chrome/status/localized Chinese proof rather than importing stale upstream viewer hunks wholesale.
- This adaptation intentionally localizes the framework and core/proof viewer surfaces, not every existing English string in the 4000-line viewer HTML. A follow-up can expand coverage one view at a time using the same safe helpers and parity tests.
- Staged Gitleaks and final post-merge verification remain pending until the commit and local-main merge steps complete.
