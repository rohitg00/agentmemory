# Issue 247 Reduce MCP Tool Surface

## Scope

Root agentmemory TypeScript/Vitest project in worktree
`/Users/A1538552/.codex/worktrees/af67/agentmemory`.

Primary task-owned surfaces:

- `src/mcp/tools-registry.ts`
- `src/cli.ts`
- `src/cli/connect/util.ts`
- `plugin/.mcp.json`
- `plugin/.mcp.copilot.json`
- `.env.example`
- `README.md`
- `INSTALL_FOR_AGENTS.md`
- `scripts/skills/generate.ts`
- `plugin/skills/agentmemory-config/SKILL.md`
- `plugin/skills/agentmemory-mcp-tools/REFERENCE.md`
- Tests that assert MCP visibility defaults and generated MCP config defaults

## Assumptions

- User approved the backward-compatible issue #247 direction after the read-only
  validation: reduce default visible MCP `tools/list` surface to the 8 core
  tools, preserve `AGENTMEMORY_TOOLS=all`, and preserve direct legacy
  `tools/call` callability.
- No fetch, pull, push, PR creation, PR merge, publish, deploy, destructive
  cleanup, or remote state change is approved.
- Existing local `refs/remotes/origin/main` exists at
  `a0f96c3ba95935b28f16807ab7a63867fcf9639d`; freshness is unverified because
  no fetch was approved.
- The worktree started clean and detached at
  `fe927dc29686b1ca6ca0546cf271eef77f852684`; local branch
  `github-pr/issue-247-reduce-mcp-surface-fe927dc` was created for PR-flow
  work.

## Sprint Contract

- **Goal:** Reduce agentmemory's default MCP tool discovery surface for issue
  #247 while keeping the full MCP tool set available by explicit opt-in and
  preserving direct calls to legacy tool names.
- **Scope:** Change default server/CLI/plugin/connect visibility from all tools
  to the core set; update docs and tests that describe the default; keep full
  count advertising accurate where it describes the available opt-in surface.
- **Non-goals:** Remove MCP tools, change `tools/call` dispatch, change REST
  endpoints, add dependencies, migrate schemas, fetch/push/create PRs, or close
  the GitHub issue.
- **Acceptance criteria:** Unset `AGENTMEMORY_TOOLS` returns the same 8 tools as
  `core`; `AGENTMEMORY_TOOLS=all` returns all 56 tools; generated/plugin MCP
  config defaults to `${AGENTMEMORY_TOOLS:-core}`; docs explain how to opt in to
  all 56 tools; direct callability is unchanged by the registry change.
- **Intended verification:** Targeted Vitest for MCP surface/connect/plugin
  config/tool count, type/lint checks if available, `corepack pnpm test` when
  dependencies are materialized or deterministic setup is possible, Semgrep for
  protocol/config/docs changes, and staged Gitleaks before commit.
- **Known boundaries:** MCP `tools/list` behavior is externally consumed; the
  user approved the compatibility-preserving behavior change in this turn by
  invoking `$github-feature-loop` after the recommendation. Direct legacy
  `tools/call` semantics must not be restricted without a separate approval.
- **Stop conditions:** A test or repo doc proves full-surface-by-default must
  remain the current product contract; implementation would require removing
  callability, adding a dependency, or changing auth/persistence/schema behavior;
  required verification or scanner findings cannot be fixed or classified.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Default visible MCP tools reduced to core | `test/mcp-surface-default.test.ts` targeted run | Passing | Red run failed because default still returned all tools; green targeted run passed 6 files / 203 tests |
| Full 56-tool surface remains opt-in | `AGENTMEMORY_TOOLS=all` test and tool count tests | Passing | `test/mcp-surface-default.test.ts` and `test/tool-count-consistency.test.ts` passed in targeted run |
| Connect/plugin MCP configs default to core | `test/cli-connect.test.ts`, `test/connect-new-agents.test.ts`, `test/copilot-plugin.test.ts`, `test/mcp-surface-default.test.ts` | Passing | Red run failed on `${AGENTMEMORY_TOOLS:-all}`; green targeted run passed 6 files / 203 tests |
| Docs explain core default and all opt-in | `rg` stale-reference check and consistency tests | Passing | Stale-reference `rg` returned no production/docs matches; generated skill reference refreshed; review-found README/INSTALL/skill stale lines fixed |
| PR-flow gates complete | Review, security scan, final verification, staged Gitleaks | Passing | Security review accepted; test/maintainability review findings fixed; Semgrep passed 0 findings; staged Gitleaks passed no leaks |

## Subagent Ledger

| Workstream | Scope | Edits allowed | Expected output | Result | Residual risk |
| --- | --- | --- | --- | --- | --- |
| Issue validation | MCP registry/server/docs/tests evidence | No | Verdict among close/already fixed/fix needed/needs approval with evidence | `needs approval/defer`; change requires approval because `tools/list` default is externally visible | No live GitHub state inspected |
| Plan review | Task record and implementation plan | No | High/medium plan findings or ACCEPT | 3 Medium findings: generated skill docs source, `.env.example`, direct-callability regression coverage | Findings accepted and folded into plan |
| Security/privacy review | Current working-tree diff | No | ACCEPT or Critical/Important findings | ACCEPT; no Critical/Important security/privacy issues | Did not rerun tests; relied on recorded verification and diff inspection |
| Test coverage review | Current working-tree diff | No | ACCEPT or Critical/Important findings | 2 Important findings: stale install/README docs and missing invalid `--tools` fallback coverage | Fixed docs and added static source coverage in `test/tool-count-consistency.test.ts` |
| Maintainability/integration review | Current working-tree diff | No | ACCEPT or Critical/Important findings | 3 Important findings: stale full-default docs, README core table mismatch, ambiguous server-side all opt-in wording | Fixed README/INSTALL/plugin skill docs and aligned core table to `ESSENTIAL_TOOLS` |

## Progress

- [x] Repo-local instructions and initial git state inspected.
- [x] Read-only issue validation subagent completed.
- [x] Approval gate reached and user invoked `$github-feature-loop` after the
  backward-compatible recommendation.
- [x] Local PR branch created from detached HEAD.
- [x] Implementation plan reviewed.
- [x] Code/docs/tests updated.
- [x] Targeted verification run.
- [x] Review/security gates run.
- [x] PR-prep staging run.
- [ ] Local commit prepared.

## Review Notes

- The existing `mcp::tools::call` implementation switches on requested tool
  names and does not check `getVisibleTools()`. This is the compatibility path:
  discovery can shrink without removing direct calls.
- Prior local test `test/mcp-surface-default.test.ts` intentionally encoded
  full-surface-by-default for issue #553. This task treats issue #247 as the
  newer product direction, with `AGENTMEMORY_TOOLS=all` as the explicit
  full-surface opt-in.
- Pre-implementation plan review found valid missing surfaces:
  `scripts/skills/generate.ts`, `.env.example`, and a targeted regression that
  proves non-core tools remain directly callable while hidden from default
  discovery.
- TDD red evidence: targeted Vitest run failed after test edits with 9 expected
  failures covering full-surface default, stale `${AGENTMEMORY_TOOLS:-all}`
  config defaults, stale CLI help, and non-core `memory_timeline` still visible
  in default discovery.
- TDD green evidence: `corepack pnpm exec vitest run
  test/mcp-surface-default.test.ts test/mcp-server-surface.test.ts
  test/tool-count-consistency.test.ts test/cli-connect.test.ts
  test/connect-new-agents.test.ts test/copilot-plugin.test.ts --exclude
  test/integration.test.ts` passed 6 files / 203 tests.
- Dependency setup note: initial `corepack pnpm exec vitest ...` was blocked by
  pnpm ignored-build hardening while materializing dependencies. Per repo
  instructions, `corepack pnpm install --frozen-lockfile --ignore-scripts` was
  run; no lockfile changes were made. The install temporarily added placeholder
  `allowBuilds` entries to `pnpm-workspace.yaml`, which were removed because
  build approvals are not task-owned.
- Stale-reference scan for `default: all`, `${AGENTMEMORY_TOOLS:-all}`, and
  related default-all phrases returned no matches across README, install docs,
  `.env.example`, plugin files, source, tests, and scripts.
- Review-fix targeted run: `corepack pnpm exec vitest run
  test/tool-count-consistency.test.ts test/mcp-surface-default.test.ts
  test/mcp-server-surface.test.ts test/cli-connect.test.ts
  test/connect-new-agents.test.ts test/copilot-plugin.test.ts --exclude
  test/integration.test.ts` passed 6 files / 204 tests after fixing stale docs
  and invalid `--tools` fallback coverage.
- Final verification after review fixes:
  - `rg` stale-reference scan over README, install docs, `.env.example`, plugin,
    source, and scripts returned no matches.
  - `git diff --check` passed.
  - `corepack pnpm run skills:check` passed; 15 skills checked.
  - `corepack pnpm test` passed 171 files / 2209 tests.
  - `corepack pnpm run lint` passed.
  - `semgrep scan --config p/default --error --metrics=off .` completed with
    0 findings.
  - `gitleaks protect --staged --redact` scanned about 26.86 KB and found no
    leaks.
- OSV not run: no dependency manifests, lockfiles, container images, vendored
  code, or third-party package surfaces are task-owned changes.
- GitHub PR prep base integration:
  - No fetch was approved; existing local `refs/remotes/origin/main` at
    `a0f96c3ba95935b28f16807ab7a63867fcf9639d` was used with unverified
    freshness.
  - Initial merge attempt inside the sandbox failed because Git could not write
    shared worktree metadata `ORIG_HEAD`; rerun with escalation reached one
    README conflict.
  - README conflict resolved by preserving issue #247 core-default behavior and
    upstream's lesson lifecycle/full-server note.
  - Post-merge `corepack pnpm test` passed 171 files / 2220 tests.
  - Post-merge `corepack pnpm run lint` passed.
  - Post-merge `corepack pnpm run skills:check` passed; 15 skills checked.
  - Post-merge `semgrep scan --config p/default --error --metrics=off .`
    completed with 0 findings.
