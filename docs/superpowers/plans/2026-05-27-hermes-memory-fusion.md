# Hermes Memory Fusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a policy-driven, shadow-first memory metacognition layer to agentmemory by borrowing the strongest ideas from RayShark/hermes-patches without importing its incompatible runtime or database architecture.

**Architecture:** Keep agentmemory's iii-engine Function/Trigger/StateKV model as the authority. Add new module-local `mem::*` functions for policy expansion, shadow write candidates, readback verification, and lesson-to-policy suggestions; wire them through the existing composition root, REST surface, and viewer only after tests prove the internal functions. Defer hard preflight blocking and automatic writes until shadow telemetry proves precision.

**Tech Stack:** TypeScript ESM, iii-sdk functions/triggers, StateKV scopes, Vitest, existing SearchIndex/VectorIndex/HybridSearch, existing viewer HTML, optional REST endpoints. No direct SQLite/PostgreSQL access and no standalone persistence.

---

## Source Baseline

External research target:

- Repository: `https://github.com/RayShark/hermes-patches`
- Inspected commit: `1034e61a81088b0129678e60e28a6c9fa7896a36`
- Relevant source files:
  - `agent/memory_metacognition.py`
  - `agent/memory_write_pipeline.py`
  - `agent/memory_semantic_classifier.py`
  - `agent/memory_graph/db/models.py`
  - `agent/memory_graph/services/search.py`
  - `agent/request_context.py`
  - `agent/shadow_write_logger.py`
  - `memory_policy.default.yaml`
  - `memory_write_config.yaml`

Current agentmemory anchor files:

- Composition root: `src/index.ts`
- State scopes: `src/state/schema.ts`
- State wrapper: `src/state/kv.ts`
- Core types: `src/types.ts`
- Ingestion: `src/functions/observe.ts`
- Durable manual memory: `src/functions/remember.ts`
- Search and indexes: `src/functions/search.ts`, `src/state/hybrid-search.ts`
- Query expansion: `src/functions/query-expansion.ts`
- Context injection: `src/functions/context.ts`
- Lessons: `src/functions/lessons.ts`, `src/functions/reflect.ts`
- Verification: `src/functions/verify.ts`
- Governance and audit: `src/functions/governance.ts`, `src/functions/audit.ts`
- REST surface: `src/triggers/api.ts`
- Viewer: `src/viewer/server.ts`, `src/viewer/index.html`

## What To Borrow

### Borrow 1: Shadow Write Pipeline

Hermes has a conservative write pipeline:

```text
conversation turn
  -> candidate extraction
  -> importance/type/conflict/dedup/review gates
  -> optional write
  -> readback verification
  -> repair queue when readback fails
```

agentmemory should borrow this as a shadow-first path. The first shipped version must not automatically call `mem::remember`. It should only produce `MemoryWriteCandidate` rows that a user or later policy can review.

Why this fits agentmemory:

- `mem::observe` already captures raw and compressed observations.
- `mem::remember` already handles durable memory persistence, supersession, BM25 indexing, vector indexing, and cascade update.
- `mem::verify` already checks evidence citations, but it does not prove that a newly saved memory can be found by future recall queries.

The missing layer is candidate generation plus readback.

### Borrow 2: Policy-Driven Query Expansion

Hermes uses a YAML policy to map user phrasing to stable recall terms. agentmemory already has `mem::expand-query`, but it is LLM-based and currently not fully integrated into the recall path.

agentmemory should add a cheap policy expansion pass:

```text
input query
  -> policy expansions from KV
  -> existing LLM expansion when enabled
  -> HybridSearch.searchWithExpansion()
```

This should improve recall for stable project vocabulary without adding model cost to every search.

### Borrow 3: Readback Verification

Hermes generates future-oriented readback queries for a candidate and verifies that the written memory appears in top search results.

agentmemory should make readback a first-class function:

```text
memory or candidate
  -> generated queries
  -> mem::search / mem::smart-search
  -> top-k hit check
  -> pass/fail with repair suggestion
```

This is distinct from `mem::verify`. `mem::verify` answers "what evidence supports this memory?" Readback answers "will this memory be retrievable later?"

### Borrow 4: Lesson To Policy Suggestion

Hermes classifies lessons into policy patch suggestions. agentmemory already stores lessons with confidence, reinforcement, decay, project scope, and context injection. The next useful step is turning repeated lessons into reviewable suggestions:

- query expansion rule
- context disclosure trigger
- preflight warning rule
- durable slot content
- ordinary lesson only

No policy file should be modified automatically in Phase 1.

### Borrow 5: Namespace Zero-Default Principle

Hermes requires a non-empty namespace for user-private memory writes. agentmemory has `agentId` tagging and `AGENTMEMORY_AGENT_SCOPE=isolated`, but not a general namespace model.

agentmemory should not copy Hermes' Telegram-specific namespace logic. It should borrow the principle:

- do not silently write private user memory into a shared/global namespace;
- make the scope explicit in candidate rows;
- block automatic writes to shared scope until a reviewer approves.

## What Not To Borrow

- Do not port Hermes' SQLAlchemy/PostgreSQL Memory Graph. agentmemory must continue using iii-engine StateKV.
- Do not introduce direct SQLite, direct Postgres, or out-of-band file persistence for core state.
- Do not copy Hermes' Telegram/user-path-specific regexes into core.
- Do not ship hard preflight blocking in the first version.
- Do not add MCP tools in Phase 1 unless the implementation also updates every required registry/count/docs file listed in `AGENTS.md`.
- Do not write policy changes from lessons without an explicit review step.

## Target Design

### New KV Scopes

Add these scopes in `src/state/schema.ts`:

```ts
memoryPolicy: "mem:policy",
writeCandidates: "mem:write-candidates",
readbackResults: "mem:readback",
policySuggestions: "mem:policy-suggestions",
```

The exact names should be short and stable because they become part of export/import and viewer state.

### New Types

Add these types in `src/types.ts`:

```ts
export interface MemoryPolicy {
  id: "default";
  updatedAt: string;
  queryExpansions: QueryExpansionRule[];
  writePolicy: MemoryWritePolicy;
  preflightRules: PreflightRule[];
}

export interface PreflightRule {
  id: string;
  tool: string;
  taskType: string;
  triggerPatterns: string[];
  decision: "allow" | "warn" | "block";
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QueryExpansionRule {
  id: string;
  trigger: string;
  expansions: string[];
  scope?: "global" | "project";
  project?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryWritePolicy {
  mode: "shadow" | "limited_auto" | "disabled";
  autoWriteThreshold: number;
  allowedAutoTypes: MemoryWriteCandidate["memoryType"][];
  neverAutoWriteShared: boolean;
}

export interface MemoryWriteCandidate {
  id: string;
  sessionId?: string;
  observationId?: string;
  project?: string;
  agentId?: string;
  scope: "global" | "project" | "agent";
  createdAt: string;
  sourceText: string;
  evidenceQuote: string;
  subject: string;
  predicate: string;
  value: string;
  memoryType:
    | "fact"
    | "preference"
    | "architecture"
    | "bug"
    | "workflow"
    | "lesson"
    | "procedural_rule"
    | "credential_route"
    | "temporary"
    | "ignore";
  confidence: number;
  importance: number;
  target: "memory" | "lesson" | "slot" | "review" | "ignore";
  requiresReview: boolean;
  reason: string;
  readbackQueries: string[];
  status: "shadow" | "approved" | "rejected" | "written" | "readback_failed";
}

export interface ReadbackResult {
  id: string;
  candidateId?: string;
  memoryId?: string;
  createdAt: string;
  queries: Array<{
    query: string;
    topIds: string[];
    matched: boolean;
  }>;
  passed: boolean;
  failureReason?: string;
}

export interface PolicySuggestion {
  id: string;
  lessonId?: string;
  createdAt: string;
  type: "query_expansion" | "preflight" | "context_disclosure" | "slot" | "memory_only";
  confidence: number;
  scope: "global" | "project";
  project?: string;
  proposal: Record<string, unknown>;
  status: "proposed" | "approved" | "rejected" | "applied";
  reasoning: string;
}
```

### New Function Modules

Create focused files:

- `src/functions/memory-policy.ts`
  - `mem::policy-get`
  - `mem::policy-update`
  - `mem::policy-expand-query`
- `src/functions/write-candidates.ts`
  - `mem::write-candidates-generate`
  - `mem::write-candidates-list`
  - `mem::write-candidates-review`
- `src/functions/readback.ts`
  - `mem::readback-verify`
  - `mem::readback-list`
- `src/functions/policy-suggestions.ts`
  - `mem::policy-suggest-from-lesson`
  - `mem::policy-suggestions-list`
  - `mem::policy-suggestions-review`

Register these in `src/index.ts` near the existing lessons/verify/retention registrations.

### REST Endpoints

Phase 1 REST should be enough for viewer and manual testing. Add endpoints in `src/triggers/api.ts`:

- `GET /agentmemory/policy`
- `POST /agentmemory/policy`
- `POST /agentmemory/policy/expand-query`
- `POST /agentmemory/write-candidates/generate`
- `GET /agentmemory/write-candidates`
- `POST /agentmemory/write-candidates/review`
- `POST /agentmemory/readback/verify`
- `GET /agentmemory/readback`

Update the REST endpoint count in `src/index.ts` and `README.md` when these are added.

Policy-suggestions endpoints belong to Phase 2 because their underlying functions are introduced there.

### MCP Tools

Do not add MCP tools in Phase 1. This avoids changing public tool count while the feature is experimental.

If MCP tools are added later, update all required files from `AGENTS.md`:

- `src/mcp/tools-registry.ts`
- `src/mcp/server.ts`
- `src/triggers/api.ts`
- `src/index.ts`
- `test/mcp-standalone.test.ts`
- `README.md`
- `plugin/.claude-plugin/plugin.json`

## Phase 1: Shadow Write And Readback

### Task 1: Add Types And KV Scopes

**Files:**

- Modify: `src/state/schema.ts`
- Modify: `src/types.ts`
- Test: `test/memory-policy-types.test.ts`

- [ ] **Step 1: Add a schema test**

Create `test/memory-policy-types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { KV } from "../src/state/schema.js";

describe("memory metacognition KV scopes", () => {
  it("defines stable scopes for policy, candidates, readback, and suggestions", () => {
    expect(KV.memoryPolicy).toBe("mem:policy");
    expect(KV.writeCandidates).toBe("mem:write-candidates");
    expect(KV.readbackResults).toBe("mem:readback");
    expect(KV.policySuggestions).toBe("mem:policy-suggestions");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- test/memory-policy-types.test.ts
```

Expected: FAIL because the new `KV` keys do not exist.

- [ ] **Step 3: Add the KV scopes and exported interfaces**

Modify `src/state/schema.ts` and `src/types.ts` with the fields from the Target Design section.

- [ ] **Step 4: Run the type test**

Run:

```bash
npm test -- test/memory-policy-types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state/schema.ts src/types.ts test/memory-policy-types.test.ts
git commit -m "feat: add memory metacognition state types"
```

### Task 2: Add Policy Get, Update, And Query Expansion

**Files:**

- Create: `src/functions/memory-policy.ts`
- Modify: `src/index.ts`
- Test: `test/memory-policy.test.ts`

- [ ] **Step 1: Write tests for default policy and rule expansion**

Create `test/memory-policy.test.ts` with cases for:

- default policy exists when no KV row has been saved;
- disabled query expansion rules are ignored;
- project-scoped rules only apply to that project;
- expansion output deduplicates original query and rule expansions.

Example assertion shape:

```ts
expect(result.expansion.original).toBe("改配置");
expect(result.expansion.reformulations).toContain("config.yaml");
expect(result.expansion.reformulations).toContain("provider");
```

- [ ] **Step 2: Run the failing test**

```bash
npm test -- test/memory-policy.test.ts
```

Expected: FAIL because `registerMemoryPolicyFunction` does not exist.

- [ ] **Step 3: Implement `src/functions/memory-policy.ts`**

Required behavior:

- `mem::policy-get` returns a default policy when `KV.memoryPolicy/default` is absent.
- `mem::policy-update` validates mode, thresholds, enabled flags, and expansion arrays before writing.
- `mem::policy-expand-query` accepts `{ query, project?, maxQueries? }`, returns `{ success, expansion }`.
- Rule expansion must not call the LLM.
- Rule expansion must return the original query plus deduplicated expansions capped by `maxQueries`.

- [ ] **Step 4: Register the function**

Modify `src/index.ts`:

```ts
registerMemoryPolicyFunction(sdk, kv);
```

Place it near `registerQueryExpansionFunction` and `registerSmartSearchFunction`.

- [ ] **Step 5: Run the tests**

```bash
npm test -- test/memory-policy.test.ts test/memory-policy-types.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/functions/memory-policy.ts src/index.ts test/memory-policy.test.ts
git commit -m "feat: add policy-driven query expansion"
```

### Task 3: Add Shadow Write Candidate Generation

**Files:**

- Create: `src/functions/write-candidates.ts`
- Modify: `src/index.ts`
- Test: `test/write-candidates.test.ts`

- [ ] **Step 1: Write candidate generation tests**

Create tests for these inputs:

- `"以后遇到这种报错，先查之前的修复记录再动手"` creates a `procedural_rule` or `workflow` candidate requiring review.
- `"我更喜欢简洁直接的回答"` creates a `preference` candidate with confidence at least `0.75`.
- `"哈哈可以"` creates no write candidate or an `ignore` candidate.
- `"我的 API key 是 sk-test"` never stores the raw secret in `sourceText`, `evidenceQuote`, or `value`.
- a generated candidate is persisted to `KV.writeCandidates` with status `shadow`.

- [ ] **Step 2: Run the failing test**

```bash
npm test -- test/write-candidates.test.ts
```

Expected: FAIL because `registerWriteCandidatesFunction` does not exist.

- [ ] **Step 3: Implement conservative extraction**

Implement `mem::write-candidates-generate` with deterministic, low-risk rules first:

- explicit preference patterns;
- explicit correction patterns;
- workflow/procedural-memory patterns;
- temporary/noise suppression;
- secret redaction before persistence.

Do not call `mem::remember`.

- [ ] **Step 4: Add list and review operations**

Implement:

- `mem::write-candidates-list` with filters `{ status?, project?, agentId?, limit? }`;
- `mem::write-candidates-review` with `{ candidateId, decision, reason? }`;
- allowed decisions: `approve`, `reject`;
- approving only changes candidate status to `approved`; it does not write memory in Phase 1.

- [ ] **Step 5: Register the function**

Modify `src/index.ts`:

```ts
registerWriteCandidatesFunction(sdk, kv);
```

- [ ] **Step 6: Run targeted tests**

```bash
npm test -- test/write-candidates.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/functions/write-candidates.ts src/index.ts test/write-candidates.test.ts
git commit -m "feat: add shadow memory write candidates"
```

### Task 4: Add Readback Verification

**Files:**

- Create: `src/functions/readback.ts`
- Modify: `src/index.ts`
- Test: `test/readback.test.ts`

- [ ] **Step 1: Write readback tests**

Cover:

- candidate readback generates at least two queries;
- memory readback checks whether the target memory id appears in top search results;
- failed readback stores a `ReadbackResult` in `KV.readbackResults`;
- readback does not mutate memories or candidates except optional candidate status `readback_failed`.

- [ ] **Step 2: Run the failing test**

```bash
npm test -- test/readback.test.ts
```

Expected: FAIL because `registerReadbackFunction` does not exist.

- [ ] **Step 3: Implement `mem::readback-verify`**

Behavior:

- accepts `{ candidateId?; memoryId?; queries?; limit?; mode?: "search" | "smart-search" }`;
- if `candidateId` is provided, load the candidate and use its `readbackQueries`;
- if `memoryId` is provided, generate queries from title/content/concepts/files;
- call existing `mem::search` or `mem::smart-search`;
- consider readback passed when target id appears in the top `limit` result IDs for any query;
- persist a `ReadbackResult`.

- [ ] **Step 4: Register the function**

Modify `src/index.ts`:

```ts
registerReadbackFunction(sdk, kv);
```

- [ ] **Step 5: Run targeted tests**

```bash
npm test -- test/readback.test.ts test/write-candidates.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/functions/readback.ts src/index.ts test/readback.test.ts
git commit -m "feat: add memory readback verification"
```

### Task 5: Add REST Endpoints

**Files:**

- Modify: `src/triggers/api.ts`
- Modify: `src/index.ts`
- Modify: `README.md`
- Test: `test/api-memory-metacognition.test.ts`

- [ ] **Step 1: Write endpoint tests**

Test:

- auth is enforced when `AGENTMEMORY_SECRET` is set;
- request bodies are whitelisted before `sdk.trigger`;
- invalid query/candidate/review payloads return 400;
- successful calls trigger the matching `mem::*` function.

- [ ] **Step 2: Run the failing test**

```bash
npm test -- test/api-memory-metacognition.test.ts
```

Expected: FAIL because the endpoints are absent.

- [ ] **Step 3: Implement REST handlers**

Add the Phase 1 endpoints from the REST Endpoints section. Follow the existing API pattern:

- parse `req.body` as `Record<string, unknown>`;
- validate strings, numbers, arrays, and enums;
- construct a whitelisted payload object;
- call `sdk.trigger({ function_id, payload })`;
- return 400 for invalid input and 200/201 for success.

- [ ] **Step 4: Update endpoint counts**

Update the boot log endpoint count in `src/index.ts` and the REST endpoint counts in `README.md`.

- [ ] **Step 5: Run targeted tests**

```bash
npm test -- test/api-memory-metacognition.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/triggers/api.ts src/index.ts README.md test/api-memory-metacognition.test.ts
git commit -m "feat: expose memory metacognition REST endpoints"
```

## Phase 2: Policy Suggestions

### Task 6: Add Lesson-To-Policy Suggestions

**Files:**

- Create: `src/functions/policy-suggestions.ts`
- Modify: `src/index.ts`
- Test: `test/policy-suggestions.test.ts`

- [ ] **Step 1: Write suggestion tests**

Cover:

- a lesson mentioning "search", "关键词", or "recall" becomes a `query_expansion` suggestion;
- a lesson mentioning "must", "before", "检查", or "执行前" becomes a `preflight` suggestion;
- private indicators such as token, key, password, chat id, or user id force project/private scope and review;
- approving a suggestion does not mutate policy until an explicit apply function exists.

- [ ] **Step 2: Implement suggestion classification**

Use deterministic scoring inspired by Hermes, but keep terms generic and project-safe.

- [ ] **Step 3: Register and test**

```bash
npm test -- test/policy-suggestions.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/functions/policy-suggestions.ts src/index.ts test/policy-suggestions.test.ts
git commit -m "feat: suggest policy changes from lessons"
```

## Phase 3: Viewer Review UI

### Task 7: Add Viewer Panels For Candidates And Suggestions

**Files:**

- Modify: `src/viewer/index.html`
- Test: existing viewer tests or add `test/viewer-memory-metacognition.test.ts`

- [ ] **Step 1: Add API client calls in the viewer script**

Add calls for:

- `GET /agentmemory/write-candidates`
- `POST /agentmemory/write-candidates/review`
- `GET /agentmemory/readback`
- `GET /agentmemory/policy-suggestions`
- `POST /agentmemory/policy-suggestions/review`

- [ ] **Step 2: Add a review-focused UI**

UI requirements:

- show candidate type, confidence, target, evidence quote, readback status;
- show approve/reject buttons;
- never display raw secret-like values;
- show policy suggestions separately from write candidates;
- keep the panel behind an existing tab or a new "Review" tab.

- [ ] **Step 3: Verify in browser**

Start a local dev instance after implementation and verify:

```bash
npm run build
npm run dev
```

Then open the viewer port and confirm the panel renders with seeded API data or fixture state.

- [ ] **Step 4: Commit**

```bash
git add src/viewer/index.html test/viewer-memory-metacognition.test.ts
git commit -m "feat: add memory review panels to viewer"
```

## Phase 4: Preflight Warning

### Task 8: Add Warn-Only Preflight Function

**Files:**

- Create: `src/functions/preflight-policy.ts`
- Modify: `src/index.ts`
- Test: `test/preflight-policy.test.ts`

- [ ] **Step 1: Write tests**

Cover:

- destructive command rules return `decision: "warn"` by default;
- no rule returns `decision: "allow"`;
- block rules are ignored unless `writePolicy.mode` or a dedicated preflight flag enables blocking;
- memory recall checks are best-effort and never throw.

- [ ] **Step 2: Implement warn-only function**

Implement `mem::preflight-check`:

```ts
type PreflightDecision = "allow" | "warn" | "block";
```

Phase 4 must return `warn` instead of `block` unless a separate future PR explicitly enables blocking.

- [ ] **Step 3: Do not wire it into hooks by default**

Expose it only as REST or internal function. Hook-level blocking needs a separate risk review.

- [ ] **Step 4: Commit**

```bash
git add src/functions/preflight-policy.ts src/index.ts test/preflight-policy.test.ts
git commit -m "feat: add warn-only memory preflight checks"
```

## Acceptance Criteria

Phase 1 is complete when:

- `npm test` passes.
- `npm run build` passes.
- policy query expansion works without LLM calls.
- write candidates are generated and persisted in shadow mode.
- no candidate generation path calls `mem::remember`.
- readback verification stores pass/fail results.
- REST handlers whitelist fields and enforce auth consistently.
- README endpoint counts are correct.
- no MCP tool count changes are introduced.

Phase 2 is complete when:

- lessons can generate reviewable policy suggestions.
- suggestions are persisted and reviewable.
- suggestions do not mutate policy automatically.

Phase 3 is complete when:

- viewer exposes candidate and suggestion review.
- secret-like content remains redacted.
- UI works on desktop and narrow viewport.

Phase 4 is complete when:

- preflight returns allow/warn/block data structures.
- default behavior remains warn-only.
- hooks do not block tools by default.

## Test Commands

Targeted tests during development:

```bash
npm test -- test/memory-policy-types.test.ts
npm test -- test/memory-policy.test.ts
npm test -- test/write-candidates.test.ts
npm test -- test/readback.test.ts
npm test -- test/api-memory-metacognition.test.ts
npm test -- test/policy-suggestions.test.ts
npm test -- test/preflight-policy.test.ts
```

Full verification before PR:

```bash
npm test
npm run build
git diff --check
```

If a PR adds Python helper scripts or docs-check-covered exported functions, add docstrings/JSDoc before pushing. The previous docstring coverage warning should be treated as a release gate even if it is only a warning.

## Risk Register

### Risk: Memory Pollution

Automatic writes can corrupt long-term memory. Phase 1 prevents this by keeping candidate generation shadow-only.

Mitigation:

- default `MemoryWritePolicy.mode = "shadow"`;
- no `mem::remember` calls from candidate generation;
- review status required before write;
- readback failure recorded instead of silently accepted.

### Risk: Search Semantics Drift

Policy expansion may change recall results.

Mitigation:

- policy expansion is explicit and inspectable;
- disabled rules are ignored;
- project-scoped rules only apply to matching projects;
- original query is always preserved.

### Risk: Privacy Leak Across Agents Or Users

agentmemory currently has `agentId` isolation but not a full user namespace model.

Mitigation:

- candidate rows carry `agentId` and `project`;
- automatic write to shared/global scope is disabled;
- viewer and REST list endpoints must support `agentId` filters consistently with existing memory/session endpoints.

### Risk: Public API Churn

Adding MCP tools would require public tool count updates and compatibility maintenance.

Mitigation:

- Phase 1 uses internal functions plus REST only;
- MCP tools are deferred until the feature has stable semantics.

### Risk: Overfitting To Hermes

Hermes contains Telegram/CJK/user-specific rules and some experimental paths.

Mitigation:

- borrow only generic mechanisms;
- keep policy data configurable;
- avoid copying hardcoded trigger phrases except in tests where they prove generic behavior.

## Open Design Decisions

These must be answered before implementation starts:

1. Should Phase 1 include viewer UI, or should it stop at REST plus internal functions?
2. Should readback verification use `mem::search`, `mem::smart-search`, or both by default?
3. Should approved write candidates be manually converted through existing `memory_save`, or should a later phase add `mem::write-candidates-apply`?
4. Should policy be project-scoped by default, or global with optional project filters?

Recommended defaults:

- Phase 1 includes REST and internal functions; viewer is Phase 3.
- readback runs both `mem::search` and `mem::smart-search` when available, and passes if either finds the target.
- approved candidates remain approved-only until a later apply function is reviewed.
- policy is global by default, with project filters on individual rules.

## PR Strategy

Use small PRs:

1. `feat: add memory metacognition state types`
2. `feat: add policy-driven query expansion`
3. `feat: add shadow memory write candidates`
4. `feat: add memory readback verification`
5. `feat: expose memory metacognition REST endpoints`
6. `feat: suggest policy changes from lessons`
7. `feat: add memory review panels to viewer`
8. `feat: add warn-only memory preflight checks`

Each PR should include:

- focused tests;
- no unrelated viewer or tool-count churn;
- updated endpoint counts when REST endpoints change;
- explicit note that Hermes code was used as inspiration, not vendored.
