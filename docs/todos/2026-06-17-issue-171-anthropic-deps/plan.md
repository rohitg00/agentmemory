# Issue 171 Anthropic Dependencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop normal npm installs from automatically installing Anthropic packages while preserving Anthropic API support and the opt-in Claude Agent SDK fallback.

**Architecture:** The Anthropic provider will follow the existing raw-fetch provider pattern used by OpenAI/OpenRouter/MiniMax and call the Messages API directly through `fetchWithTimeout`. The Claude Agent SDK fallback remains a dynamic import, but package metadata moves it out of auto-installed runtime dependencies and tests assert a clear missing-peer error.

**Tech Stack:** TypeScript ESM, Node 22 global `fetch`, `fetchWithTimeout`, pnpm 11 lockfile, Vitest.

---

## Files

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/providers/anthropic.ts`
- Modify: `src/providers/agent-sdk.ts`
- Modify: `tsdown.config.ts`
- Modify: `test/compress-model.test.ts`
- Modify: `test/agent-sdk-provider.test.ts`
- Modify: `test/fetch-timeout.test.ts`
- Modify: `test/quality-gates.test.ts`
- Modify: `SECURITY.md`
- Modify if necessary after inspection: `README.md`, localized READMEs
- Modify task state: `docs/todos/2026-06-17-issue-171-anthropic-deps/todo.md`

## Task 1: Raw-Fetch Anthropic Provider

**Files:**
- Modify: `src/providers/anthropic.ts`
- Modify: `test/compress-model.test.ts`

- [x] **Step 1: Replace the SDK mock with fetch assertions**

In `test/compress-model.test.ts`, remove the `vi.mock("@anthropic-ai/sdk", ...)` block and use the existing `mockChatResponse()` helper for Anthropic. The Anthropic test should construct `new AnthropicProvider("test-key", "main-model", 4096, "https://anthropic.example.test", "cheap-model")`, call `compress()` and `summarize()`, assert models `cheap-model` then `main-model`, and assert headers include `x-api-key: test-key` plus `anthropic-version: 2023-06-01`.

- [x] **Step 2: Run the focused test and confirm it fails before implementation**

Run: `corepack pnpm exec vitest run test/compress-model.test.ts`

Expected before implementation: failure caused by the removed SDK mock or missing fetch-based Anthropic behavior.

- [x] **Step 3: Implement raw-fetch calls**

Update `src/providers/anthropic.ts` to:
- remove `import Anthropic from '@anthropic-ai/sdk'`
- import `fetchWithTimeout` from `./_fetch.js`
- default `baseURL` to `https://api.anthropic.com`
- POST to `${baseURL without trailing slash}/v1/messages`
- send headers `Content-Type`, `x-api-key`, and `anthropic-version`
- send body fields `model`, `max_tokens`, `system`, and a single user text message
- parse `content` text blocks and return the first text string or `""`
- throw `Anthropic API error (<status>)` for non-OK responses without echoing upstream body text

- [x] **Step 4: Add image request coverage**

Add or update a Vitest case proving `describeImage()` sends an image content block with the supplied base64 data and MIME type, plus a text prompt, and returns the response text.

- [x] **Step 5: Add error handling coverage**

Add a Vitest case proving a non-OK Anthropic response rejects with `Anthropic API error (<status>)` and does not leak upstream body text.

- [x] **Step 6: Add timeout regression coverage**

In `test/fetch-timeout.test.ts`, import `AnthropicProvider` and add a provider hang regression matching the existing MiniMax/OpenRouter pattern: set `AGENTMEMORY_LLM_TIMEOUT_MS=50`, mock `globalThis.fetch` with `hangingFetch`, construct `new AnthropicProvider("test-key", "claude-sonnet-4-20250514", 800)`, and assert `compress()` rejects when upstream hangs.

- [x] **Step 7: Run provider tests**

Run: `corepack pnpm exec vitest run test/compress-model.test.ts test/fetch-timeout.test.ts`

Expected: all tests in those files pass.

## Task 2: Agent SDK Optional Peer

**Files:**
- Modify: `src/providers/agent-sdk.ts`
- Modify: `test/agent-sdk-provider.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `tsdown.config.ts`

- [x] **Step 1: Remove the compile-time SDK module dependency from tests**

Refactor `test/agent-sdk-provider.test.ts` away from `vi.mock("@anthropic-ai/claude-agent-sdk", ...)`. Construct `AgentSDKProvider` with an injected async loader that returns a local structural fake:

```ts
type FakeSdk = {
  query(args: { prompt: string; options: { systemPrompt: string } }): AsyncIterable<{ type: "result"; result: string }>;
};
```

This proves source tests do not require the optional peer to be installed.

- [x] **Step 2: Add a missing-peer regression test**

In `test/agent-sdk-provider.test.ts`, add a test that mocks the dynamic import failing with `ERR_MODULE_NOT_FOUND` and asserts `provider.summarize()` rejects with a message naming `@anthropic-ai/claude-agent-sdk`, `AGENTMEMORY_ALLOW_AGENT_SDK=true`, and an install command.

- [x] **Step 3: Make the provider error explicit without external types**

Replace `typeof import('@anthropic-ai/claude-agent-sdk')` with a local structural type for the `query()` function used by this provider. Add an optional constructor parameter for the SDK loader, defaulting to a dynamic import implemented without TypeScript resolving the optional peer at compile time. Wrap module-not-found failures so they throw a clear error: `Claude Agent SDK fallback requires @anthropic-ai/claude-agent-sdk. Install it alongside agentmemory and set AGENTMEMORY_ALLOW_AGENT_SDK=true to opt in.`

- [x] **Step 4: Update package metadata**

In `package.json`:
- remove `@anthropic-ai/sdk` from `dependencies`
- remove `@anthropic-ai/claude-agent-sdk` from `dependencies`
- add `peerDependencies` with `@anthropic-ai/claude-agent-sdk` at the existing compatible range
- add `peerDependenciesMeta` marking `@anthropic-ai/claude-agent-sdk` optional

- [x] **Step 5: Update build externalization**

In `tsdown.config.ts`, remove `@anthropic-ai/sdk` from `neverBundle`. Keep `@anthropic-ai/claude-agent-sdk` external only because it is still a dynamic optional peer.

- [x] **Step 6: Regenerate the lockfile metadata**

Run: `corepack pnpm install --lockfile-only --ignore-scripts`

Expected: `pnpm-lock.yaml` root importer no longer has Anthropic packages under normal dependencies; the agent SDK appears only as an optional peer relationship if pnpm records it.

- [x] **Step 7: Prove the frozen source install works**

Run: `corepack pnpm install --frozen-lockfile --ignore-scripts`

Expected: install succeeds without needing Anthropic packages as normal dependencies or devDependencies.

- [x] **Step 8: Run targeted tests**

Run: `corepack pnpm exec vitest run test/agent-sdk-provider.test.ts test/compress-model.test.ts test/fetch-timeout.test.ts`

Expected: all three files pass.

## Task 3: Package Contract And Docs

**Files:**
- Modify: `test/quality-gates.test.ts`
- Modify: `SECURITY.md`
- Modify if stale references exist: `README.md`, localized READMEs, `CHANGELOG.md`

- [x] **Step 1: Add package metadata guard**

Add a quality-gate test that reads root `package.json` and asserts neither `@anthropic-ai/sdk` nor `@anthropic-ai/claude-agent-sdk` is present in `dependencies`, `optionalDependencies`, `bundledDependencies`, or `bundleDependencies`, and that `@anthropic-ai/claude-agent-sdk` is an optional peer dependency.

- [x] **Step 2: Update supply-chain docs**

Update `SECURITY.md` runtime dependency count and text so it no longer states Anthropic packages are part of the default runtime dependency tree. Mention the Claude Agent SDK fallback as an optional peer used only by explicit opt-in.

- [x] **Step 3: Search stale references**

Run: `rg -n "6 production deps|@anthropic-ai/sdk|@anthropic-ai/claude-agent-sdk|npm installs anthropic|Claude Agent SDK fallback" README.md SECURITY.md CHANGELOG.md READMEs test src package.json pnpm-lock.yaml tsdown.config.ts`

Expected: remaining Anthropic package references are either provider docs, dynamic-import code, tests, changelog history, or optional peer documentation.

- [x] **Step 4: Run contract tests**

Run: `corepack pnpm exec vitest run test/quality-gates.test.ts test/build-package-contract.test.ts`

Expected: tests pass.

## Task 4: Verification, Security, And Local PR Prep

**Files:**
- Modify: `docs/todos/2026-06-17-issue-171-anthropic-deps/todo.md`
- No source edits unless verification finds a scoped issue.

- [x] **Step 1: Run functional checks**

Run:
- `corepack pnpm exec vitest run test/compress-model.test.ts test/agent-sdk-provider.test.ts test/fetch-timeout.test.ts test/quality-gates.test.ts test/build-package-contract.test.ts`
- `corepack pnpm run build`
- `corepack pnpm run lint`

- [x] **Step 2: Run package checks**

Run:
- `npm pack --dry-run --json`
- `corepack pnpm --dir packages/mcp pack --dry-run --json`

Expected: package previews do not include unexpected source-only artifacts; root metadata does not auto-install Anthropic packages.

- [x] **Step 3: Run consumer npm install smoke**

Run:
- `npm pack --json`
- create a temporary directory under `/private/tmp`
- `npm init -y`
- `npm install --package-lock-only --ignore-scripts <absolute path to packed tarball>`
- inspect `package-lock.json` with `jq` and assert no package key contains `node_modules/@anthropic-ai/sdk` or `node_modules/@anthropic-ai/claude-agent-sdk`

Expected: npm resolver metadata for a consumer install does not include Anthropic packages.

- [x] **Step 4: Run required security checks**

Run:
- `osv-scanner scan source .`
- `semgrep scan --config p/default --error --metrics=off .`
- `git diff --check`

Expected: no unaccepted findings. If scanners are missing or network-blocked, record the exact blocker and do not claim the gate passed.

- [x] **Step 5: Focused simplification pass**

Review touched source/tests for avoidable duplication, unclear errors, and stale comments. Preserve provider APIs, package boundaries, and runtime behavior.

- [ ] **Step 6: Delegate local staging, Gitleaks, commit, and PR-prep handoff to github-push-prepare**

Use `github-push-prepare` local-only mode for staging only task-owned files, inspecting staged hunks, running `gitleaks protect --staged --redact`, committing, and preparing the local branch for a GitHub PR.

Expected: only task-owned files are staged/committed; existing local `origin/main` is used only if available; no fetch, push, PR creation, publish, or deploy occurs; base freshness is reported as unverified.

## Plan Self-Review

Spec coverage: Covers issue #171 install behavior, preserves Anthropic provider support, preserves opt-in Agent SDK fallback, and includes package/security gates.

Placeholder scan: No `TBD`, unresolved placeholders, or unspecified test commands remain.

Type consistency: Provider API remains `MemoryProvider`; tests use existing Vitest patterns and package metadata is guarded through `test/quality-gates.test.ts`.
