# Issue 716 / PR 717 Review

Scope: `src/hooks/_project.ts`, hook-generated project attribution, project-scoped memory/search behavior, and local review documentation.

Branch: `review/issue-716-pr-717-canonical-project-identity`

## Decision

Fork decision: already-fixed for the local same-basename collision class, defer canonical remote URL identity, reject PR 717 as-is.

No code from PR 717 was imported. The current fork already resolves Git projects to an opaque `git:<sha256>` key derived from the Git common-dir parent, with `AGENTMEMORY_PROJECT_ID` and `AGENTMEMORY_PROJECT_NAME` remaining explicit overrides. That avoids silent same-basename memory sharing and keeps linked worktrees on the same local repository scope without persisting host paths.

The cross-machine stable identity part of Issue 716 remains a product and migration decision, not a safe automatic import. PR 717 changes the default persisted project key to a canonical remote identifier. That can be useful for multi-machine shared memory, but it also stores repository host, owner, and repo names in project fields that flow through sessions, memories, profiles, search filters, exports, diagnostics, and mesh payloads. The fork already has an explicit `AGENTMEMORY_PROJECT_ID` override for deployments that want agent-independent stable scoping.

## Issue-First Findings

- Claimed problem: basename-based project keys can collide across unrelated same-named repos and fragment shared memory when the same repo is checked out under different local directory names.
- Current fork relevance:
  - Same-basename collision: not relevant in current fork. The resolver no longer uses Git toplevel basename for Git repositories.
  - Linked worktree fragmentation: not relevant in current fork for linked worktrees from the same parent repository.
  - Cross-machine remote identity: still not provided by default, but changing this default would alter persisted project identity and privacy behavior.
- Existing related local work: local history contains an opaque Git project-scope change and hardening for non-string `cwd` handling. The review did not edit related worktrees.

## PR 717 Inspection

PR 717 proposes this resolver order:

1. `AGENTMEMORY_PROJECT_NAME`
2. canonical `remote.origin.url`
3. Git toplevel basename
4. `cwd` basename

The patch canonicalizes HTTPS, SSH, SCP-style remotes, strips credentials and `.git`, lowercases the key, switches Git subprocess calls to `execFileSync`, and updates generated hook scripts plus resolver tests.

Assessment:
- Positive: avoids same-basename collisions and cross-checkout fragmentation when `origin` is stable; uses `execFileSync` in the revised patch, avoiding shell interpolation.
- Problematic for this fork: it replaces a privacy-preserving opaque local key with a remote metadata key by default.
- Incomplete for this fork: no migration or backfill plan for already-stored basename or opaque project IDs; no operator opt-in for exposing remote-derived identifiers; no fork/upstream remote policy beyond `origin`.

## Security Review

Auth and isolation:
- Project identity is part of access isolation for memory search and context selection. Any key change can make historical rows invisible or, if backfilled incorrectly, mix scopes.
- Current fork keeps explicit override variables for deployments that need stable cross-agent scoping.

Data exposure:
- PR 717 strips credentials, which is necessary.
- The remaining `host/owner/repo` value can still reveal private repository metadata in persisted rows, profiles, exported data, diagnostic output, and mesh traffic.
- Current opaque IDs avoid host path and remote name disclosure by default.

Path and subprocess handling:
- Current fork uses `execFileSync("git", args, ...)` and bounded timeouts.
- PR 717's final shape also uses `execFileSync`; the initial shell-interpolation shape was corrected upstream.

Protocol and schema handling:
- PR 717 parses remote URL forms and lowercases path segments. This may be acceptable for common forge hosts but is not universally true for every Git server path namespace.
- No persisted schema migration is included.

Prompt and LLM flows:
- No direct LLM prompt path changes were found. Indirectly, project keys can appear in retrieved context and summaries.

DoS and performance:
- Both current fork and PR 717 use bounded Git subprocesses. PR 717 adds a `git config` call before fallback; current fork uses Git common-dir resolution.

Supply chain, hooks, tooling, persistence:
- PR 717 updates generated hook scripts. Importing it would require regenerating and reviewing all generated hook artifacts in this fork.
- No dependency changes are involved.
- Persisted project identity churn is the main persistence risk.

## Verification Evidence

- `git status -sb --untracked-files=all`: branch active and initially clean.
- Public-read Issue 716 and PR 717 patch inspection completed with no credentialed GitHub reads or writes.
- Targeted repo-native test attempt in this worktree:
  - `npm test -- test/hook-project.test.ts test/worktree-project-scope.test.ts`
  - Result: failed before tests because this worktree has no `node_modules` and `vitest` is not on PATH.
- Targeted resolver harness in this worktree:
  - `/Users/A1538552/_projects/_tools/agentmemory/node_modules/.bin/tsx -e '<resolver harness>'`
  - Result: passed. Evidence JSON: `{"sameBasenameDistinct":true,"linkedWorktreesShare":true,"legacyOverride":"same-name","opaquePrefix":"git:"}`.
- Vitest toolchain workaround:
  - A temporary config under `/private/tmp` allowed partial execution, but `test/worktree-project-scope.test.ts` then required package resolution for `iii-sdk` from the worktree. I stopped before creating a `node_modules` symlink in the repo.
  - `test/hook-project.test.ts` did pass in that partial run: 14 tests passed; the suite failure was package resolution for `iii-sdk` in the second test file, not a resolver assertion.
- Documentation checks:
  - Neutral-reference scan found no external URLs, active issue references, or mentions in the task record.
  - `git diff --no-index --check` produced no whitespace-error output for the new task files.

## Review Gates

- Security best-practices passive review: no critical or major issue in the docs-only local diff. For PR 717 itself, the security concern is default remote metadata persistence without an opt-in, migration, or privacy policy.
- Simple-code pass: no cleanup edit made; the docs are scoped to the requested decision and evidence.
- Focused code-review request: subagent dispatch was not run because this environment exposes subagents only when the user explicitly asks for delegation. I performed the focused requirements/test/security/integration review locally against the task-owned docs diff; no critical or important finding.
- Review Implementation: local adversarial pass found no actionable finding. Evidence inspected: `plan.md`, `todo.md`, current resolver, related tests, PR 717 patch, and verification output.
- Codex Security diff scan: skipped for the local docs-only diff because no source, auth, persistence, parser, hook, dependency, CI, or schema behavior changed. Security analysis of PR 717 is recorded above.

## Progress

- [x] Read repo-local instructions.
- [x] Checked branch and status.
- [x] Read coordinator worklist.
- [x] Inspected current resolver and tests.
- [x] Inspected related local project-identity work from history.
- [x] Inspected Issue 716 and PR 717 via public reads.
- [x] Reproduced the relevant current resolver behavior with a targeted harness.
- [x] Made fork decision.
- [x] Added neutral local documentation.
- [x] Run documentation checks.
- [x] Execute `$prep-merge-to-local-main`.

## Prep Merge Result

- Documentation commit: `e03722ec6c09905e7bea248d123f66276ec217a4`.
- Merged local `main` commit: `60099a31029575412ba6fc27f4ab986196922e56`.
- Merge result: merge commit created without conflicts.
- Post-merge checks:
  - `git diff --check`: no output.
  - Resolver harness: passed with same-basename repos distinct, linked worktrees shared, legacy override preserved, and opaque `git:` project prefix.
  - `gitleaks detect --source . --redact`: no leaks found.
- Full repo-native Vitest remains limited in this worktree because `node_modules` is absent; no dependency install or repo-local dependency symlink was created.
- Ignored verification artifact: the Vitest startup attempt created `node_modules/.vite/vitest/.../results.json` in this worktree. It is not staged, not tracked, and is reported for cleanup because deleting ignored files needs explicit approval.

## Review Notes

The safest current fork action is no code import. A future remote-canonical project identity feature should be opt-in or migration-backed, with an explicit privacy notice, a remote selection policy, and a backfill/alias strategy for existing basename and opaque project rows.
