# Contributing to agentmemory

Thanks for taking an interest. This file is the short path from "I have an idea" to "it's in main."

## Ground rules

- Apache-2.0 license applies to every contribution.
- Sign-off is required on every commit (see [DCO](#developer-certificate-of-origin) below).
- Be civil. [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) applies.
- No attribution headers ("Generated with Claude Code", "Co-Authored-By: Claude", etc.) in commits or PR descriptions.

## Before you open an issue

Search existing issues first:

- [open issues](https://github.com/rohitg00/agentmemory/issues?q=is%3Aissue+is%3Aopen)
- [closed issues](https://github.com/rohitg00/agentmemory/issues?q=is%3Aissue+is%3Aclosed)

If it's a bug: provide the repro steps, your Node version, OS, agentmemory version (`npm view @agentmemory/agentmemory version`), and what you expected vs. what you saw.

If it's a feature: describe the user problem before the implementation. "I couldn't X because Y" beats "please add X."

## Before you open a PR

1. Fork the repo and create a branch off `main`:
   - `feat/<short-name>` for features
   - `fix/<issue-number>-<short-name>` for bug fixes
   - `docs/<topic>`, `refactor/<topic>`, `chore/<topic>` for the rest
2. `npm install` — you need Node >=20.
3. `npm run build` — TypeScript must compile clean.
4. `npm test` — the full test suite must pass. The one integration test under `test/integration.test.ts` needs a live server on `:3111` and is fine to skip locally.
5. Commit with sign-off. Rebase over tiny fixup commits so the history stays readable.

## Pull request flow

- Keep PRs small and focused. One logical change per PR.
- Write a clear description: what it does, why, and how to verify.
- Link the issue the PR resolves (`Fixes #NNN` / `Closes #NNN`).
- Expect CodeRabbit to review automatically. Address its comments before asking a human.
- Address review feedback in new commits (do not force-push to the same branch). Maintainers may squash on merge.
- A maintainer will merge when tests pass, CodeRabbit is green, and any review comments are addressed.

## Developer Certificate of Origin

Every commit must carry a `Signed-off-by` trailer stating you have the right to submit the contribution under Apache-2.0. The full text of the DCO is at <https://developercertificate.org>.

Add it automatically:

```bash
git commit -s -m "feat: your message"
```

PRs with commits lacking sign-off will not merge.

## Coding style

- TypeScript strict mode. No `any` unless justified in a comment.
- Prettier-compatible formatting (editor on save is fine; no repo-wide hook).
- No code comments that restate what the code does. Only write a comment when the *why* is non-obvious — a hidden constraint, an invariant, a workaround for a specific bug.
- No dead code, no commented-out imports.
- Tests live next to the feature in `test/<feature>.test.ts`. Name the test after the behavior, not the implementation.

## Subsystems at a glance

| Directory | What lives here |
|-|-|
| `src/triggers/api.ts` | Every HTTP endpoint under `/agentmemory/*`. Adding an MCP tool? Add the REST twin here too. |
| `src/mcp/` | Standalone MCP server (`@agentmemory/mcp`), tools registry, transport, in-memory KV. |
| `src/functions/` | Core memory operations — observe, compress, consolidate, retention, forget, graph, smart-search, export-import, governance. |
| `src/hooks/` | The 12 auto-hooks that capture sessions in agents. |
| `src/cli/` | The `agentmemory` CLI, including `connect/` adapters for 18 agents and the guideline writer for hook-less agents. |
| `src/health/` | Liveness + readiness + alert thresholds. |
| `src/state/` | KV schema, keyed mutex, access log. |
| `integrations/` | First-party plugins: `hermes/`, `openclaw/`, `pi/`, `filesystem-watcher/`. |
| `plugin/` | Agent plugin bundle: Claude Code plugin, hook manifests for Codex/Copilot/Droid, the OpenCode capture plugin, and the skills. Hook manifests and skill REFERENCE files are partly generated; run `npm run skills:gen` after touching registered endpoints or env vars. |
| `website/` | Marketing site (Next.js 16). |
| `test/` | Vitest test suite. |

## Adding an MCP tool

1. Register the function in `src/functions/<area>.ts`.
2. Register the HTTP trigger in `src/triggers/api.ts` with a matching `api_path`.
3. Add the tool entry in `src/mcp/tools-registry.ts`.
4. Implement in `src/mcp/standalone.ts` if the standalone MCP package should also expose it.
5. Write a test under `test/`.
6. No CHANGELOG touch in the PR itself — release PRs are the only place CHANGELOG changes.

## Adding an auto-hook

1. Add the new `HookType` string to the union in `src/types.ts`.
2. Wire the handler in `src/hooks/<hook-name>.ts`.
3. Add a Vitest case that fires the hook and asserts the observation gets written.

## Release process

Maintainers cut releases. Every bump touches these files in lockstep (the consistency tests fail if the trio of doc counts or any version drifts):

1. `package.json`
2. `src/version.ts`
3. `plugin/.claude-plugin/plugin.json`
4. `plugin/plugin.json`
5. `plugin/.codex-plugin/plugin.json`
6. `packages/mcp/package.json`
7. `src/types.ts` (`ExportData.version` union)
8. `src/functions/export-import.ts` (`supportedVersions` Set)

No lockfiles are committed. `test/export-import.test.ts` asserts against the `VERSION` constant, so it needs no per-release edit. Run `npm run skills:gen` if the endpoint or env surface changed.

Then: CHANGELOG section, PR, merge, tag, GitHub release. The `Publish to npm` workflow picks up the release trigger and publishes `@agentmemory/agentmemory`, `@agentmemory/mcp`, and `@agentmemory/fs-watcher` to npm with provenance (`@agentmemory/fs-watcher` versions independently from `integrations/filesystem-watcher/package.json`).

## Security issues

Do not open a public issue for a security report. See [SECURITY.md](./SECURITY.md).

## Questions

- Implementation questions: open a GitHub Discussion.
- Governance questions: open an issue labeled `governance`. See [GOVERNANCE.md](./GOVERNANCE.md).
