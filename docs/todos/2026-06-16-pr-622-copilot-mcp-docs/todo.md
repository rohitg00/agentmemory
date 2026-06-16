# PR 622 Copilot MCP Docs Review

## Scope

Owning scope: repository documentation for MCP client onboarding.

Task branch: `review/issue-589-pr-622-copilot-mcp-docs`.

Inputs inspected:

- Issue 589 public API payload
- PR 622 public API payload and public diff
- Current `README.md`
- `src/cli/connect/copilot-cli.ts`
- `src/cli/connect/util.ts`
- `test/copilot-plugin.test.ts`
- Coordinator worklist entry for PR 622 / Issue 589 / Fork issue 552

## Sprint Contract

Goal: decide whether PR 622 should be imported into the fork and, if useful, adapt the minimal documentation needed for VS Code Copilot MCP users.

Scope:

- README MCP client documentation only.
- Local task record for review evidence.

Non-goals:

- No Copilot CLI adapter behavior changes.
- No new connect adapter for VS Code.
- No plugin, MCP tool, hook, or package metadata changes.
- No GitHub writes, labels, comments, or pushes.

Acceptance criteria:

- Issue 589 is evaluated against current fork documentation and config.
- PR 622 is treated as untrusted input and either imported, adapted, rejected, deferred, already fixed, or blocked.
- Any documentation change explains VS Code Copilot's `servers` shape without weakening secret handling or fallback semantics.
- Verification covers README consistency and markdown/diff sanity.
- `$prep-merge-to-local-main` is run before final handoff.

Intended verification:

- `rg -n "GitHub Copilot|VS Code|\\.vscode/mcp\\.json|\"servers\"|AGENTMEMORY_REQUIRE_SERVER" README.md`
- `git diff --check`
- `git status -sb --untracked-files=all`

Known boundaries:

- Public GitHub reads only.
- No dependency installs unless explicitly approved.
- No remote state changes.
- No authenticated GitHub or browser-session reads.

Stop conditions:

- Any required fix crosses auth, persistence, schema, dependency, or system-boundary behavior.
- Verification reveals stale or conflicting Copilot/MCP documentation that cannot be resolved with a minimal README edit.
- `$prep-merge-to-local-main` reports a blocking review, merge, or verification condition.

## Feature / Verification Matrix

| Change | Verification method | Status | Evidence |
| --- | --- | --- | --- |
| Decide PR 622 fate | Compare Issue 589, PR 622 diff, and current README/CLI config | complete | Adapted import. Public issue reports VS Code Copilot Agent Mode using `servers`; current README covered Copilot CLI but not VS Code Copilot `servers` shape. |
| Add minimal README guidance if still relevant | `rg` for VS Code Copilot terms and security flags; `git diff --check` | complete | README now documents `.vscode/mcp.json` / VS Code user MCP settings with `servers`, existing env defaults, and 7-vs-53-tool fallback behavior. |
| Security review | Manual review of docs snippet for secret handling, tool exposure, unsafe commands, fallback behavior | complete | No secret literal, no unsafe shell beyond existing `npx -y @agentmemory/mcp`, no broad file writes, and fail-hard mode remains documented for central deployments. |
| Merge prep | `$prep-merge-to-local-main` | pending | Pending after implementation and verification. |

## Decision

Adapted import. PR 622 addresses a real gap for VS Code Copilot users, but its old README context did not match the current fork and its snippet omitted the fork's current env default pattern. The fork should keep the existing Copilot CLI adapter/docs and add only a manual VS Code Copilot `servers` example in `README.md`.

## Verification Evidence

- `rg -n "GitHub Copilot|VS Code|\\.vscode/mcp\\.json|\"servers\"|AGENTMEMORY_REQUIRE_SERVER" README.md` found the new VS Code Copilot row, config block, and fail-hard guidance.
- `git diff --check` exited 0.
- `git status -sb --untracked-files=all` showed only `README.md` and this task record directory as task-owned changes.
