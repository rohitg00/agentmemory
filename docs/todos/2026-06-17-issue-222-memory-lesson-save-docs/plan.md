# Memory Lesson Save Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document the existing `memory_lesson_save` MCP tool and lesson lifecycle so issue `wbugitlab1/agentmemory#222` / upstream `rohitg00/agentmemory#552` is addressed without runtime changes.

**Architecture:** This is a documentation-only change anchored to the implemented lesson subsystem. README will be the primary user-facing surface; task-local docs will record evidence and verification. Generated skill reference docs already list the tool and should not be rewritten unless drift is proven.

**Tech Stack:** Markdown, TypeScript source inspection, Vitest targeted checks, pnpm project scripts.

---

## Source Of Truth

No separate spec exists. The source of truth is the user's request, the public issue body, this task record, and verified repo evidence:

- `src/mcp/tools-registry.ts`: MCP tool names, descriptions, parameters, and core-set membership.
- `src/mcp/server.ts`: MCP argument handling and trigger payloads.
- `src/functions/lessons.ts`: confidence, duplicate reinforcement, explicit strengthening, list/recall, and decay behavior.
- `src/triggers/api.ts`: REST endpoint paths and observed payload handling. Do not claim REST hardening beyond the current implementation.
- `test/lessons.test.ts`, `test/mcp-server-surface.test.ts`, `test/mcp-standalone.test.ts`, `test/api-boundary-coverage.test.ts`: contract coverage.

## File Structure

- Modify: `README.md`
  - Add lesson-specific rows to the MCP tool inventory.
  - Add a short section explaining `memory_lesson_save` versus `memory_save`.
  - Document the lifecycle using only implemented behavior.
- Modify: `docs/todos/2026-06-17-issue-222-memory-lesson-save-docs/todo.md`
  - Keep progress, matrix, review notes, and final verification evidence current.
- No generated files are planned.
- No runtime code, tests, package metadata, lockfiles, plugin metadata, or translated READMEs are planned.

## Task 1: Plan Review And Drift Baseline

**Files:**
- Read: `README.md`
- Read: `src/mcp/tools-registry.ts`
- Read: `src/mcp/server.ts`
- Read: `src/functions/lessons.ts`
- Read: `src/triggers/api.ts`
- Read: `test/lessons.test.ts`
- Read: `test/mcp-server-surface.test.ts`
- Read: `test/api-boundary-coverage.test.ts`
- Modify: `docs/todos/2026-06-17-issue-222-memory-lesson-save-docs/todo.md`

- [ ] **Step 1: Run pre-implementation plan review**

Dispatch a read-only reviewer with this prompt:

```text
Review docs/todos/2026-06-17-issue-222-memory-lesson-save-docs/plan.md against the user request and the verified source files for issue #222. Return ACCEPT or only High/Medium findings with concrete evidence. Focus on documentation accuracy, generated-doc drift risk, verification gaps, and scope creep. Do not edit files.
```

- [ ] **Step 2: Check generated skill docs drift before deciding not to regenerate**

Run:

```bash
corepack pnpm run skills:check
```

Expected: exit 0, or a recorded blocker/drift unrelated to the task. If the command reports generated drift touching `plugin/skills/agentmemory-mcp-tools/REFERENCE.md` for `memory_lesson_save`, stop and decide whether a generator run is task-owned.

- [ ] **Step 3: Update task state with review and drift evidence**

Add evidence to `todo.md`:

```markdown
## Review Notes

- Pre-implementation review: ACCEPT or triaged findings.
- Generated-doc drift baseline: command, exit code, and affected paths.
```

## Task 2: README MCP Inventory And Lesson Lifecycle Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/todos/2026-06-17-issue-222-memory-lesson-save-docs/todo.md`

- [ ] **Step 1: Add lesson tools to the README MCP inventory**

In the `### 56 Tools` section, first adjust the core-tools summary so it distinguishes the server core set from the standalone local fallback. The full server/proxy surface has 56 tools and `AGENTMEMORY_TOOLS=core` includes `memory_lesson_save`; the no-server local fallback stays the documented 7-tool fallback and does not implement lesson lifecycle tools.

Then update the server core and extended tables so they reflect the registry:

```markdown
| `memory_lesson_save` | Save a lesson with confidence, tags, project scope, and reinforcement lifecycle |
| `memory_lesson_recall` | Search saved lessons by query with project and confidence filters |
| `memory_lesson_list` | List saved lessons by project, source, confidence, and limit |
| `memory_lesson_strengthen` | Reinforce an existing lesson by ID |
```

Keep `memory_lesson_save` in the server core table because `ESSENTIAL_TOOLS` includes it. Put recall/list/strengthen in the extended table unless registry evidence says otherwise. Do not label lesson lifecycle tools as available in the no-server local fallback.

- [ ] **Step 2: Add `memory_lesson_save` versus `memory_save` guidance**

Add a concise subsection after the MCP inventory details:

```markdown
### Lessons vs Memories

Use `memory_lesson_save` for reusable workflow guidance: rules, pitfalls, and "prefer/avoid" lessons that should gain or lose confidence over time. Use `memory_save` for ordinary durable facts, decisions, and patterns that do not need the lesson lifecycle.

`memory_lesson_save` accepts `content` (required), plus optional `context`, `confidence`, `project`, and comma-separated `tags`. New lessons default to `confidence: 0.5` unless a value from `0.0` to `1.0` is provided; out-of-range values fall back to `0.5`. Saving the same lesson content again in the same `project` and `source` strengthens the existing lesson instead of creating a duplicate.
```

- [ ] **Step 3: Document lifecycle and REST equivalents**

Extend the subsection with implemented lifecycle details:

```markdown
Lesson confidence changes through reinforcement and decay:

- Duplicate `memory_lesson_save` calls and `memory_lesson_strengthen` both increment `reinforcements`, update `lastReinforcedAt`, and move confidence 10% of the remaining distance toward `1.0`.
- `memory_lesson_recall` searches content, context, and tags, then ranks matches by confidence, text relevance, and recency since creation or last reinforcement.
- `memory_lesson_list` lists non-deleted lessons sorted by confidence and can filter by `project`, `source`, `minConfidence`, and `limit`.
- The lesson decay sweep runs from the server lifecycle and lowers confidence after at least one week without reinforcement by `decayRate` (`0.05` by default) per elapsed week. Unreinforced lessons at or below `0.1` confidence are soft-deleted.

The full server REST equivalents are `POST /agentmemory/lessons`, `GET /agentmemory/lessons`, `POST /agentmemory/lessons/search`, and `POST /agentmemory/lessons/strengthen`.
```

- [ ] **Step 4: Update task matrix**

Mark the README documentation rows as done with file/section evidence.

## Task 3: Verification, Review, And Local Commit Prep

**Files:**
- Read/verify: `README.md`
- Read/verify: `src/mcp/tools-registry.ts`
- Read/verify: `src/mcp/server.ts`
- Read/verify: `src/functions/lessons.ts`
- Read/verify: `src/triggers/api.ts`
- Read/verify: relevant tests
- Modify: `docs/todos/2026-06-17-issue-222-memory-lesson-save-docs/todo.md`

- [ ] **Step 1: Run targeted source/docs searches**

Run:

```bash
rg -n "memory_lesson_save|memory_lesson_recall|memory_lesson_list|memory_lesson_strengthen|Lessons vs Memories|POST /agentmemory/lessons" README.md src/mcp/tools-registry.ts src/mcp/server.ts src/functions/lessons.ts src/triggers/api.ts test/lessons.test.ts test/mcp-server-surface.test.ts test/api-boundary-coverage.test.ts
```

Expected: README lines exist for each lesson MCP tool and lifecycle section; source/test lines confirm the behavior being documented. The README must state that lesson lifecycle tools require the full server/proxy surface, not the no-server local fallback.

- [ ] **Step 2: Run targeted tests covering documentation consistency and lesson behavior**

Run:

```bash
corepack pnpm exec vitest run test/tool-count-consistency.test.ts test/lessons.test.ts test/mcp-server-surface.test.ts test/api-boundary-coverage.test.ts test/mcp-surface-default.test.ts test/mcp-standalone-proxy.test.ts --exclude test/integration.test.ts
```

Expected: all selected tests pass. `test/mcp-surface-default.test.ts` covers server core visibility for `memory_lesson_save`; `test/mcp-standalone-proxy.test.ts` covers the 7-tool no-server local fallback and rejects `memory_lesson_save` there. If pnpm ignored-build hardening blocks the command, follow `AGENTS.md`: run `corepack pnpm install --frozen-lockfile --ignore-scripts`, then rerun the same command.

- [ ] **Step 3: Run docs/generated reference check**

Run:

```bash
corepack pnpm run skills:check
```

Expected: exit 0 or documented unrelated drift. Do not run generators unless drift is task-owned and narrow.

- [ ] **Step 4: Run final review subagents**

Dispatch reviewers for documentation accuracy, maintainability/scope, and security-sensitive boundary check. They must return ACCEPT or High/Medium findings with evidence.

- [ ] **Step 5: Run required security gates for documentation/tooling-surface changes**

Because this changes agent-facing documentation and repository task state, run repo/local security checks required by workspace policy:

```bash
gitleaks detect --source . --redact
semgrep scan --config p/default --error --metrics=off .
```

If tools are missing or network is blocked, record the blocker and the closest completed alternative. Before committing staged content, also run:

```bash
gitleaks protect --staged --redact
```

- [ ] **Step 6: Stage and commit only task-owned files**

After verification and review, stage:

```bash
git add README.md docs/todos/2026-06-17-issue-222-memory-lesson-save-docs/todo.md docs/todos/2026-06-17-issue-222-memory-lesson-save-docs/plan.md
```

Inspect:

```bash
git diff --cached --name-status
git diff --cached
```

Commit:

```bash
git commit -m "docs: document memory lesson save lifecycle"
```

- [ ] **Step 7: Run github-push-prepare local branch prep**

Run the local branch-prep phase without fetch/push/PR creation unless the user separately approves those remote actions. Use the existing local `origin/main` ref if available and explicitly report freshness as unverified.

## Self-Review

- Spec coverage: The plan covers issue validation, README inventory, server-core versus fallback boundaries, `memory_lesson_save` versus `memory_save`, lifecycle docs, REST endpoint equivalents, generated-doc drift checks, targeted tests, security gates, commit prep, and GitHub PR-flow handoff.
- Placeholder scan: No `TBD`, unresolved `TODO`, or "similar to" placeholders remain.
- Type consistency: Tool names and REST paths match current source evidence.
