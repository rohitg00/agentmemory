# Issue 809 OpenRouter Embedding Dimensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenRouter embedding dimensions configurable while preserving backward-compatible behavior for existing OpenRouter embedding users.

**Architecture:** Keep the change inside the existing OpenRouter embedding provider and provider tests. Add a local `resolveDimensions` helper mirroring the OpenAI provider's override pattern, but only include the OpenRouter `dimensions` request field when an explicit override is configured.

**Tech Stack:** TypeScript ESM, Vitest, existing `fetchWithTimeout` provider transport, existing `.env.example` and README configuration docs.

---

### Task 1: Regression Tests

**Files:**
- Modify: `test/embedding-provider.test.ts`

- [ ] **Step 1: Add OpenRouter env key isolation**

Add `OPENROUTER_EMBEDDING_MODEL` and `OPENROUTER_EMBEDDING_DIMENSIONS` to the `ENV_KEYS` array so tests do not leak configuration across cases.

- [ ] **Step 2: Add failing OpenRouter provider tests**

Add a new `describe("OpenRouterEmbeddingProvider", ...)` block after `OpenAIEmbeddingProvider` tests with these behaviors:
- default dimensions are 1536
- `OPENROUTER_EMBEDDING_DIMENSIONS=1024` changes `provider.dimensions`
- configured dimensions are sent in the request body
- unset or whitespace-only dimensions are not sent in the request body
- invalid values such as `not-a-number`, `-5`, `0`, and `1.5` throw a positive-integer error

- [ ] **Step 3: Run red verification**

Run: `/Users/A1538552/_projects/_tools/agentmemory/node_modules/.bin/vitest run test/embedding-provider.test.ts`

Expected: OpenRouter dimension tests fail against the current hardcoded provider.

### Task 2: Minimal Provider Fix

**Files:**
- Modify: `src/providers/embedding/openrouter.ts`

- [ ] **Step 1: Add dimension parsing**

Add a default `1536`, a positive-safe-integer parser for `OPENROUTER_EMBEDDING_DIMENSIONS`, and a `sendDimensions` flag that is true only when the trimmed env var is non-empty.

- [ ] **Step 2: Apply the request-body behavior**

Build the OpenRouter embedding request body as `{ model, input }`, and add `dimensions` only when `sendDimensions` is true.

- [ ] **Step 3: Run green verification**

Run: `/Users/A1538552/_projects/_tools/agentmemory/node_modules/.bin/vitest run test/embedding-provider.test.ts`

Expected: all tests in `test/embedding-provider.test.ts` pass.

### Task 3: Configuration Documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Document the env var in `.env.example`**

Add a commented `OPENROUTER_EMBEDDING_DIMENSIONS=1536` line below `OPENROUTER_EMBEDDING_MODEL`.

- [ ] **Step 2: Document the env var in README**

Update the OpenRouter embedding provider row and the example env block to mention `OPENROUTER_EMBEDDING_DIMENSIONS` for non-1536 models.

- [ ] **Step 3: Inspect docs references**

Run: `rg -n "OPENROUTER_EMBEDDING_(MODEL|DIMENSIONS)|OpenRouter" .env.example README.md src/providers/embedding/openrouter.ts test/embedding-provider.test.ts`

Expected: OpenRouter model and dimensions references are present and consistent.

### Task 4: Verification and Merge Prep

**Files:**
- Review all task-owned files.

- [ ] **Step 1: Run targeted and repo checks**

Run:
- `/Users/A1538552/_projects/_tools/agentmemory/node_modules/.bin/vitest run test/embedding-provider.test.ts`
- `npm run build`
- `npm run lint`
- `npm test`

- [ ] **Step 2: Run security gates**

Run mandatory scope gates before commit:
- `semgrep scan --config p/default --error --metrics=off .`
- `osv-scanner scan source .`
- after staging, `gitleaks protect --staged --redact`

- [ ] **Step 3: Run prep merge**

Invoke `$prep-merge-to-local-main` to perform task-owned cleanup/review/commit discipline, merge captured local `main` if needed, and run final verification.
