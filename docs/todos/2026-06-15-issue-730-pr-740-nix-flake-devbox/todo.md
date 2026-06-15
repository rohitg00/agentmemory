# Issue 730 / PR 740 Nix Flake + Devbox Review

## Scope

Repository: `/Users/A1538552/.codex/worktrees/4fcf/agentmemory`

Working branch: `review/issue-730-pr-740-nix-flake-devbox`

Coordinator item: Issue 730, PR 740, Fork issue 489.

## Sprint Contract

Goal: Review Issue 730 before PR 740, determine whether Nix flake and Devbox support is still relevant for this fork, and either import, adapt, reject, defer, mark already fixed, or block with evidence.

Scope:
- Inspect current installation and packaging surfaces.
- Inspect PR 740 as untrusted input through public read-only data.
- Evaluate supply-chain and tooling risk for Nix, Devbox, package manager, lockfiles, scripts, external sources, and credential exposure.
- Apply only a minimal task-owned change when the review supports it.
- Document the local decision neutrally without GitHub URLs, hash issue syntax, or mentions.
- Run `$prep-merge-to-local-main` before handoff.

Non-goals:
- No GitHub writes, pushes, PR creation, labels, or tracker comments.
- No credentialed GitHub API or logged-in browser reads.
- No dependency installation or broad tooling migration unless separately approved.
- No unrelated package manager, CI, auth, storage, routing, or runtime refactors.

Acceptance criteria:
- Issue-first relevance is documented.
- PR 740 diff and tests are inspected as untrusted input.
- Security/supply-chain review is documented.
- Decision is recorded as import, adapted import, reject, defer, already fixed, or blocked.
- Any task-owned changes are verified with the smallest meaningful checks and required security gates where available.
- `$prep-merge-to-local-main` outcome is recorded.

Stop conditions:
- The change requires approval-gated external state, credentialed reads, pushes, publishing, dependency installation, schema/data migration, or broad system-boundary changes.
- Required security tooling finds unresolved blocking issues.
- Correct behavior cannot be established from public data and local repo evidence.

## Assumptions

- Public, unauthenticated GitHub reads are allowed.
- The current detached worktree is the requested new worktree; it has been switched to the target branch.
- The repo currently has no `docs/lessons/` directory to load.

## Feature / Verification Matrix

| Change / Decision | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Establish target branch and clean baseline | `git status -sb --untracked-files=all`, `git worktree list --porcelain` | pass | Clean branch `review/issue-730-pr-740-nix-flake-devbox` at local main commit before task edits. |
| Issue-first relevance | Inspect current install/package docs and public Issue 730 data | pass | Current fork has npm/npx, Docker, and manual engine install paths, but no Nix flake or Devbox support. Issue 730 remains relevant. |
| PR 740 diff review | Public PR metadata and diff inspection | pass | PR 740 changes `.gitignore`, `README.md`, adds `devbox.json`, `flake.nix`, and a 5,048-line `package-lock.json`. |
| Supply-chain/security review | Manual review plus required diff scan if applicable | pass | Codex Security diff scan found no reportable product-security finding; supply-chain/tooling posture is not acceptable for import as-is. |
| Implementation decision | Local diff inspection | pass | Decision: defer/reject PR 740 as-is. No PR code imported. |
| Targeted verification | Repo-native checks for touched surface | pass | `rg -n "https?://|#[0-9]+|@[A-Za-z0-9_-]+" docs/todos/2026-06-15-issue-730-pr-740-nix-flake-devbox/todo.md` returned no matches. Security report validator passed. |
| Prep merge to local main | `$prep-merge-to-local-main` workflow | pending | Pending final branch state. |

## Progress

- 2026-06-15: Read workspace and repo instructions.
- 2026-06-15: Created target branch from detached clean local main commit.
- 2026-06-15: Confirmed no existing Nix flake or Devbox files in the current fork checkout.
- 2026-06-15: Fetched public Issue 730 and PR 740 metadata and patch without credentialed GitHub reads.
- 2026-06-15: Reviewed PR 740 as untrusted input. The patch applies cleanly but is stale against this fork and conflicts with current lockfile/tooling posture.
- 2026-06-15: Ran Codex Security diff scan for the PR 740 patch. Reports:
  - `/tmp/codex-security-scans/agentmemory/6c387b4_20260615T213413Z/report.md`
  - `/tmp/codex-security-scans/agentmemory/6c387b4_20260615T213413Z/report.html`
- 2026-06-15: Prep review chain before staging:
  - `$security-best-practices`: passive orientation only; docs-only task record introduces no code/security boundary.
  - `$simple-code`: no simplification change needed.
  - `$requesting-code-review`: subagent dispatch not available under current tool policy without explicit subagent authorization; performed local focused review instead.
  - `$review-implementation`: local review found no critical, important, or minor actionable findings for the task-owned documentation.

## Review Notes

Decision: defer/reject PR 740 as-is.

Issue-first finding:
- Issue 730 remains relevant for this fork because there is no current Nix flake or Devbox support.
- The current repo installs and develops through npm/npx, generated npm lockfiles in CI, Docker, and manual iii-engine paths.

PR 740 review:
- The patch adds Nix and Devbox surfaces but does not include `flake.lock` or `devbox.lock`; it also updates `.gitignore` to ignore both lockfiles.
- The patch reverses the repo's current `package-lock.json` ignore rule and adds a committed npm lockfile.
- The added lockfile targets package version `0.9.24`; current fork version is `0.9.27`.
- The added lockfile omits the fork's current `overrides` and diverges from current dependency constraints.
- `devbox.json` and the Nix dev shell run `npm install --legacy-peer-deps` automatically when `node_modules` is absent.
- README guidance includes a remote shell installer for Devbox.
- `flake.nix` hardcodes version `0.9.24`, uses unlocked inputs in the PR, and sets `NPM_CONFIG_IGNORE_SCRIPTS=true`, which is not enough evidence that native/optional package behavior remains correct.

Security result:
- No reportable product-security candidate survived discovery.
- Supply-chain and tooling risk is sufficient to reject/defer the PR as-is.

Residual risk:
- Issue 730 still needs a properly designed packaging decision if the fork wants Nix support.
- A future implementation should settle lockfile policy first, preserve current dependency constraints and overrides, commit required Nix/Devbox locks when claiming reproducibility, avoid automatic networked install hooks, and verify actual Nix/Devbox builds.
