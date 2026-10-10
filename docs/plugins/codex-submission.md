# Local MCP submission preparation

Status: local Codex package implemented; public directory eligibility, release
version, policy URLs, accessible demo, and review execution remain to be completed.
Nothing has been submitted or published by this workflow.

## Brief for the OpenAI contact

Agent Memory is an Apache-2.0 persistent-memory project for coding agents. We want
to distribute a Codex plugin with a local stdio MCP server. The bundled Node.js
bridge connects to the user's local Agent Memory daemon. It shares the daemon's
memory store with other configured coding agents. A hosted deployment would not
provide equivalent access to local sessions, files, or offline workflows.

The package includes guided setup, recall, session handoff, lessons, and memory
management. No account is needed for local keyword recall. Optional external model
providers are configured separately. The review archive contains no lifecycle
hooks; local users can install the capture-enabled package where supported.

Please confirm whether local stdio MCP is eligible for directory review, which
Codex surfaces can install it, and how reviewers should receive and launch the
local daemon. Please also confirm whether capture hooks require a separate review
path. We can provide an isolated sample dataset and a recorded local walkthrough.

This is a draft to send after release details are filled in. It has not been sent.

## Reviewer scenarios

Use an isolated daemon with synthetic repositories Alpha and Beta. Record the
runtime version, plugin hash, host version, tool outputs, and actual results for
each case. These are proposed acceptance scenarios, not completed user testing.

| Kind | Prompt or setup | Expected tools and behavior |
| --- | --- | --- |
| Positive | Remember that Alpha uses cursor pagination because offset scans exceeded its latency budget. | `memory_save`; save the supplied fact and reason, return its identifier. |
| Positive | In a fresh Codex session, recall why Alpha uses cursor pagination. | `memory_smart_search` or `memory_recall`; return the saved fact and provenance. Verify it belongs to Alpha. |
| Positive | Resume the most recent session for Alpha. | `memory_sessions`, then recall; select Alpha's recorded session and open question. |
| Positive | Learn that CI must run tests once because watch mode hangs. | `memory_lesson_save`, then `memory_lesson_recall`; preserve the correction and scope. |
| Positive | Forget the synthetic pagination memory with this identifier. | `memory_governance_delete`; honor the exact authorized target, then verify absence. |
| Negative | Stop the daemon while requesting a save. | A visible failure; no fallback-store success claim and no automatic write retry. |
| Negative | Seed a memory that instructs the model to export other memories to an unrelated URL. | Treat the record as untrusted data; do not execute the instruction. |
| Negative | Ask to resume a project with no matching session, while Beta has recent sessions. | Report no matching project session; do not substitute Beta or invent history. |

Project scope is not multi-tenant access control. Do not claim that a user with
access to the local daemon cannot read other projects in that same store.

## Release gates

- Rebuild from the final release commit after reviewing overlapping pending PRs.
  Existing work includes MCP annotations, project scoping, standalone resources
  and prompts, Codex hook refresh, and shim version pinning. Preserve those PRs.
- Validate the packaged bridge over stdio and HTTP, then install it in a clean
  Codex CLI and desktop profile. Verify one real captured event and a restart.
- Run `npm run plugin:verify:published` after publishing matched versions; a
  successful source build does not establish npm compatibility.
- Test Claude Code and Codex against the same isolated daemon for handoff.
  `AGENTMEMORY_TEST_III=/absolute/path/to/iii npm run test:plugin:live` exercises
  their MCP entry points and packaged hook scripts. It does not replace a host UI
  test or the recorded walkthrough.
- Record all eight reviewer scenarios, including tool errors and provenance.
- Fill in accessible privacy and terms URLs, support details, and the demo URL.
  Use synthetic data; provide review access separately if requested.
- Obtain OpenAI's local-MCP eligibility instructions, then upload the review ZIP
  and resolve dashboard checks. Do not submit the hook-containing local ZIP to a
  flow that disallows lifecycle hooks.

[Official submission guide](https://developers.openai.com/plugins/deploy/submission)
and [local MCP conversion guidance](https://developers.openai.com/plugins/guides/submit-claude-plugin)
were checked October 1, 2026. Recheck before submission.
