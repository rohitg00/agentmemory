# AgentMemory Enhancement Opportunities

## Executive Summary

AgentMemory is a mature, production-grade persistent memory system for AI coding agents (v0.9.27). After analyzing the codebase, architecture, and feature set, this document identifies 11 high-impact enhancement opportunities to improve memory retention, retrieval quality, security, and usability.

**Key Findings (verified against source):**
- 95.2% retrieval accuracy on benchmarks, but no feedback loop to maintain/improve this metric
- Powerful hybrid search (BM25 + vector + graph); weights are env-configurable (`BM25_WEIGHT`) but not query-adaptive
- Hook-captured observations ARE secrets-scrubbed (`stripPrivateData`, 15 patterns), but manual saves, imports, lessons, and slots bypass scrubbing entirely
- Decay machinery exists for `SemanticMemory`/`ProceduralMemory`/`Insight` (`decayRate`, `lastAccessedAt`, `DecayConfig`), but the core `Memory` type and hybrid-search ranking don't use it
- Deduplication is exact-hash only (5-minute TTL) — semantically identical observations stored separately
- `stale` flags exist on graph nodes/edges but not on `Memory`; no automatic conflict detection between memories

---

## Current System Architecture (v0.9.27)

### Core Capabilities
- **Storage:** SQLite-backed KV store (`~/.agentmemory/state_store.db`)
- **Observation Pipeline:** Hook capture → Compression (LLM or synthetic) → Storage
- **Retrieval:** Hybrid search (BM25 + vector embeddings + knowledge graph)
- **Consolidation:** Session-end LLM synthesis into long-term memories
- **Integrations:** 16+ agents (Claude Code, Copilot, Cursor, Gemini, etc.)
- **API Surface:** 128 REST endpoints + 53 MCP tools
- **Test Coverage:** 950+ tests across 129 test files

### Data Model
```typescript
Session → RawObservation → CompressedObservation → Memory
         (capture)         (compress)              (consolidate)
```

**Key fields:**
- `Memory`: type (pattern|preference|architecture|bug|workflow|fact), strength (1–10), files[], concepts[], supersedes[], isLatest, forgetAfter (TTL)
- `CompressedObservation`: title, facts[], narrative, importance (0–1), type, concepts, files
- `Session`: project, cwd, status, observationCount, tags, model, agentId

---

## What Already Exists (Verification Notes)

Before proposing changes, these capabilities were verified in the source — proposals below build on them rather than duplicating them:

| Capability | Where | Notes |
|---|---|---|
| Secrets scrubbing | `src/functions/privacy.ts`, applied in `observe.ts:80-87` | 15 regex patterns (OpenAI `sk-`/`sk-proj-`, Anthropic `sk-ant-`, GitHub `ghp_`/`github_pat_`, AWS `AKIA`, Google `AIza`, JWT, Slack `xoxb-`, npm, GitLab `glpat-`, DigitalOcean, Bearer, generic `key=value`) run over the **full serialized payload** before field extraction. Also strips `<private>` tags. |
| Exact-hash dedup | `src/functions/dedup.ts` | SHA-256 of `sessionId:toolName:toolInput[:500]`, 5-minute TTL. Exact-match only. |
| Decay fields | `src/types.ts` | `SemanticMemory` has `accessCount`/`lastAccessedAt`/`strength`; `ProceduralMemory` and `Insight` have `decayRate`/`lastDecayedAt`/`reinforcements`; a `DecayConfig` (lambda, sigma, hot/warm tier thresholds) and retention scoring (`temporalDecay`, `reinforcementBoost`, `salience`) exist for `mem::retention-evict`. |
| Supersession | `src/types.ts` | `Memory.supersedes[]`/`isLatest`/`version` exist (manual only). `GraphEdge` is bitemporal (`tcommit`, `tvalid`, `tvalidEnd`) with `supersededBy`/`isLatest` and a `succeeded_by` edge type. |
| Staleness | `src/types.ts` | `stale?: boolean` exists on `GraphNode` and `GraphEdge` — not on `Memory`. |
| Scope | `src/types.ts:233` | `MemorySlot` has `scope: "project" \| "global"` plus a global-slots KV scope — `Memory` itself has only `project?`. |
| Search weights | `src/config.ts:223` | `BM25_WEIGHT` env var with validation (default 0.4); weights are static per-process, not per-query. |
| TTL forgetting | `src/types.ts:100` | `Memory.forgetAfter` exists for hard expiry. |

---

## Enhancement Recommendations

### 1. **Temporal Memory Decay** (Priority: High)
**Impact:** Improves relevance of recall results | **Effort:** Low | **Breaking:** No

#### Problem
The system already has decay machinery — `DecayConfig` (lambda, sigma, hot/warm tiers), `temporalDecay`/`reinforcementBoost` retention scoring, and `decayRate`/`lastAccessedAt` fields on `SemanticMemory`, `ProceduralMemory`, and `Insight`. But the **core `Memory` type** (output of consolidation) has none of these, and **hybrid-search ranking ignores decay entirely**. A consolidated memory about a deleted file from 6 months ago has the same retrieval weight as one from yesterday. `Memory.forgetAfter` provides hard TTL expiry, but nothing in between full strength and deletion.

#### Solution
Extend the existing decay machinery to `Memory` and wire it into search ranking — no new decay framework needed:

1. **Add the same fields the other memory types already have:**
   ```typescript
   interface Memory {
     // existing...
     lastAccessedAt?: string;
     accessCount?: number;
     decayRate?: number; // reuse DecayConfig.lambda as default
   }
   ```

2. **Compute decayed strength at query time:**
   ```typescript
   const daysSinceAccess = (Date.now() - new Date(memory.lastAccessedAt).getTime()) / (1000 * 60 * 60 * 24);
   const decayedStrength = memory.strength * Math.exp(-0.01 * daysSinceAccess);
   ```

3. **Bump strength + update `lastAccessedAt` when recalled:**
   - In `search.ts`, after a memory is returned in results, trigger a background update
   - Increase `strength` by 0.2 (up to 10) and set `lastAccessedAt = now()`
   - This implements spaced repetition: frequently accessed memories stay fresh

#### Files to Change
- `src/types.ts` — Add `lastAccessedAt`, `accessCount`, `decayRate` to `Memory` (mirror `SemanticMemory` fields)
- `src/state/hybrid-search.ts` — Apply decayed strength in RRF result ranking
- `src/functions/search.ts` / recall path — Update memory on access (fire-and-forget background task)
- Reuse the existing `DecayConfig` from the retention-evict pipeline as the source of lambda — do not introduce a second decay constant

#### Testing
- Unit test: verify decay formula with known timestamps
- Integration test: recall same memory twice, verify strength increased on second call

---

### 2. **Semantic Deduplication** (Priority: High)
**Impact:** Reduces index bloat, improves precision | **Effort:** Medium | **Breaking:** No

#### Problem
Observations with identical or near-identical meaning are stored separately. Example:
- "Fixed JWT expiry bug in auth middleware"
- "Resolved token expiration issue in `src/auth/jwt.ts`"
- "Bug: JWT tokens expiring too early"

These appear as 3 separate observations instead of 1, inflating the index and making recall results noisier.

The existing `DedupMap` ([dedup.ts](src/functions/dedup.ts)) only catches **exact** repeats: SHA-256 of `sessionId:toolName:toolInput` with a 5-minute TTL. It exists to absorb hook double-fires, not semantic duplicates — anything phrased differently, arriving later than 5 minutes, or from another session passes through.

#### Solution
At compress time, compare new observation embedding against recent observations; if cosine similarity > 0.92, merge instead of creating new entry.

1. **Add to `CompressedObservation`:**
   ```typescript
   interface CompressedObservation {
     // existing...
     mergedFromIds?: string[]; // Track provenance
     isDuplicate?: boolean;
   }
   ```

2. **In `compress.ts` (after LLM compression):**
   ```typescript
   // Get embedding for new observation
   const embedding = await embeddingProvider.embed(newObs.narrative);
   
   // Find recent observations in same session
   const recentObs = await kv.list<CompressedObservation>(
     KV.obs(sessionId),
     { limit: 50, sortBy: "timestamp:desc" }
   );
   
   // Check for duplicates
   for (const existing of recentObs) {
     const similarity = cosineSimilarity(embedding, existing.embedding);
     if (similarity > 0.92) {
       // Merge: append facts, bump importance
       existing.facts.push(...newObs.facts);
       existing.importance = Math.max(existing.importance, newObs.importance);
       existing.mergedFromIds = [...(existing.mergedFromIds || []), newObs.id];
       await kv.set(KV.obs(sessionId), existing.id, existing);
       return { success: true, merged: true, targetId: existing.id };
     }
   }
   
   // No duplicate found, save normally
   ```

3. **Web viewer enhancement:**
   - Show badge "merged from 3 observations" on deduplicated entries
   - Expandable list of merged observation titles

#### Files to Change
- `src/types.ts` — Add `mergedFromIds`, `isDuplicate`
- `src/functions/compress.ts` — Add dedup logic before saving
- `src/viewer/document.ts` — Show merge metadata in UI

#### Testing
- Unit test: mock embeddings with known similarities, verify dedup threshold
- Integration test: consolidate session with 5 near-identical observations, verify only 1 survives

---

### 3. **Memory Conflict Detection & Auto-Supersede** (Priority: High)
**Impact:** Prevents contradictory recall | **Effort:** High | **Breaking:** No

#### Problem
Two memories can contradict without being detected:
- Memory A: "Auth uses JWT tokens stored in localStorage"
- Memory B: "Auth was migrated to server-side session cookies"

Both survive in the store. A future search might return both, confusing the agent about the current state.

The building blocks already exist: `Memory.supersedes[]`/`isLatest`/`version`, and the knowledge graph is bitemporal — `GraphEdge` carries `tcommit`/`tvalid`/`tvalidEnd`, `supersededBy`, `isLatest`, and a `succeeded_by` edge type. What's missing is anything that populates these **automatically** at the memory level.

#### Solution
During consolidation, detect contradictions and auto-populate the existing `supersedes` field (no schema change needed).

1. **New function: `detect-contradictions.ts`**
   ```typescript
   export async function detectMemoryContradictions(
     memories: Memory[],
     provider: MemoryProvider
   ): Promise<{ primary: Memory; superseded: Memory[] }[]> {
     const conflicts: { primary: Memory; superseded: Memory[] }[] = [];
     
     // Group by shared concepts
     const byConceptId = new Map<string, Memory[]>();
     for (const mem of memories) {
       for (const concept of mem.concepts) {
         if (!byConceptId.has(concept)) byConceptId.set(concept, []);
         byConceptId.get(concept)!.push(mem);
       }
     }
     
     // For each concept group, check for contradictions
     for (const [concept, group] of byConceptId) {
       if (group.length < 2) continue;
       
       // Use LLM to detect contradictions
       const conflict = await provider.detectContradiction(group);
       if (conflict) {
         conflicts.push({
           primary: conflict.newer,
           superseded: [conflict.older]
         });
       }
     }
     
     return conflicts;
   }
   ```

2. **In `consolidation-pipeline.ts`:**
   ```typescript
   // After consolidating observations into memories...
   const conflicts = await detectMemoryContradictions(newMemories, provider);
   for (const { primary, superseded } of conflicts) {
     primary.supersedes = (primary.supersedes || []).concat(superseded.map(m => m.id));
     await kv.set(KV.memories, primary.id, primary);
     
     // Mark superseded memories
     for (const old of superseded) {
       old.isLatest = false;
       await kv.set(KV.memories, old.id, old);
     }
   }
   ```

3. **In `hybrid-search.ts`:**
   ```typescript
   // Filter out superseded memories from results
   const results = await bm25.search(query);
   return results.filter(r => !r.memory.supersedes?.includes(r.memory.id));
   ```

4. **Web viewer:**
   - Show "Superseded by [newer memory]" badge on old memories
   - Timeline view showing evolution of a concept

#### Files to Change
- `src/functions/detect-contradictions.ts` — New file
- `src/functions/consolidation-pipeline.ts` — Call contradiction detector
- `src/state/hybrid-search.ts` — Filter superseded memories
- `src/viewer/document.ts` — Show supersession relationships

#### Testing
- Unit test: mock LLM conflict detection, verify supersedes field populated
- Integration test: consolidate two sessions with conflicting auth implementations, verify newer supersedes older

---

### 4. **Close Secrets-Scrubbing Bypass Paths** (Priority: Critical)
**Impact:** Prevents accidental credential leakage | **Effort:** Low–Medium | **Breaking:** No

#### What Already Works (verified)
`src/functions/privacy.ts` has a solid `stripPrivateData` with 15 patterns (OpenAI, Anthropic, GitHub, AWS, Google, JWT, Slack, npm, GitLab, DigitalOcean, Bearer tokens, generic `key=value`, `<private>` tags). [observe.ts:80-87](src/functions/observe.ts#L80-L87) runs it over the **full serialized payload** before `toolInput`/`toolOutput` are extracted — so the hook capture path is well covered. Do **not** build a parallel `secrets-detector.ts`.

#### Actual Gaps
1. **Bypass paths:** `grep -rn stripPrivateData src/` shows only `privacy.ts` and `observe.ts` reference it. Every other ingestion path stores content **unscrubbed**:
   - `memory_save` MCP tool / `POST /agentmemory/memories/save` (explicit saves)
   - `POST /agentmemory/import` (bulk import)
   - Lessons (`memory_lesson_save`), slots (`memory_slot_*`), team share, sketches
   - LLM compression output (`compress.ts`) — a model could echo a secret from context into `narrative`/`facts` even though the raw input was scrubbed
2. **Missing patterns:** PEM private key blocks (`-----BEGIN ... PRIVATE KEY-----`) and DB connection strings with embedded credentials (`postgres://user:pass@host`) are not in `SECRET_PATTERN_SOURCES`.
3. **No observability:** scrubbing is silent — no `sanitized` flag, no redaction count, no audit event, so there's no way to confirm coverage in production.

#### Solution
1. **Add the two missing patterns to `privacy.ts`:**
   ```typescript
   // append to SECRET_PATTERN_SOURCES
   /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
   /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\/\s:]+:[^@\s]+@/gi,
   ```

2. **Apply `stripPrivateData` at every write boundary**, not just hook capture. Cleanest approach: a single chokepoint in `StateKV` write helpers for the content-bearing scopes (`mem:memories`, `mem:slots`, lessons, team-shared), or explicitly in each save function:
   - `memory-save.ts`, `export-import.ts` (import path), `lessons.ts`, `slots.ts`, `team.ts`, `sketches.ts`
   - `compress.ts` — scrub the LLM output (`title`, `facts`, `narrative`) before persisting

3. **Make redaction observable:**
   ```typescript
   // privacy.ts — return count alongside output
   export function stripPrivateDataWithStats(input: string): { output: string; redactions: number };
   ```
   - Set `sanitized: true` + `redactionCount` on `RawObservation`
   - Emit `recordAudit("SECRETS_REDACTED", { count, scope })` when count > 0
   - Add `sanitizationStats` to `GET /agentmemory/health`

#### Files to Change
- `src/functions/privacy.ts` — Add 2 patterns, add stats-returning variant
- `src/functions/memory-save.ts`, `export-import.ts`, `lessons.ts`, `slots.ts`, `team.ts`, `sketches.ts`, `compress.ts` — Apply scrubbing at write
- `src/types.ts` — Add `sanitized`, `redactionCount` to `RawObservation`
- `src/triggers/api.ts` — Sanitization stats in health endpoint

#### Testing
- Unit test: PEM block and `postgres://user:pass@host` are redacted
- Integration test: save memory via MCP `memory_save` containing a fake `ghp_` token, verify `[REDACTED_SECRET]` in storage
- Integration test: import a JSON export containing secrets, verify scrubbed on ingest
- Security audit: scan stored database for all 17 patterns (should find none)

---

### 5. **Cross-Project Memory Scope** (Priority: Medium)
**Impact:** Enables reuse across projects | **Effort:** Medium | **Breaking:** No

#### Problem
Memories are scoped to a single `project` (`Memory.project?`). If you solve the same problem in Project A and later work on Project B, the solution isn't found—you must re-learn it.

A scope model already exists for slots: `MemorySlot` has `scope: "project" | "global"` (types.ts:233) plus a dedicated `mem:global-slots` KV scope. The gap is that `Memory` records — the bulk of long-term knowledge — have no equivalent.

#### Solution
Extend the existing slot scope model to `Memory`: `project` (current) | `workspace` (user's machine) | `global` (team). Reuse the slot scoping conventions rather than inventing a new mechanism.

1. **Extend `Memory` type:**
   ```typescript
   interface Memory {
     // existing...
     scope: "project" | "workspace" | "global";
     // project-scoped: visibility limited to one project
     // workspace-scoped: visible across projects on this machine
     // global-scoped: shared with entire team (requires governance)
   }
   ```

2. **Update `memory_save` MCP tool:**
   ```typescript
   export interface MemorySaveInput {
     title: string;
     content: string;
     type: "pattern" | "preference" | "architecture" | "bug" | "workflow" | "fact";
     concepts?: string[];
     files?: string[];
     scope?: "project" | "workspace" | "global"; // New
     // ... existing
   }
   ```

3. **In `recall` / `smart-search`:**
   ```typescript
   async function recall(query: string, options?: { scope?: "project" | "workspace" | "global" }) {
     let searchMemories = allMemories;
     
     if (options?.scope === "project") {
       searchMemories = searchMemories.filter(m => m.project === currentProject && m.scope !== "global");
     } else if (options?.scope === "workspace") {
       searchMemories = searchMemories.filter(m => m.project === currentProject || m.scope === "workspace");
     } else {
       // default: project + workspace scopes
       searchMemories = searchMemories.filter(m => 
         m.project === currentProject || m.scope === "workspace"
       );
     }
     
     return hybridSearch(query, searchMemories);
   }
   ```

4. **UI enhancements:**
   - Badge on memories showing scope: `[PROJECT]`, `[WORKSPACE]`, `[TEAM]`
   - When saving, offer scope selector: "Remember this for... [this project] [my machine] [my team]"

#### Files to Change
- `src/types.ts` — Add `scope` field
- `src/functions/memory-save.ts` — Accept scope parameter
- `src/state/hybrid-search.ts` — Filter by scope
- `src/mcp/tools-registry.ts` — Update `memory_save` schema
- `src/viewer/document.ts` — Show scope badge

#### Testing
- Integration test: save memory with scope=workspace, verify it surfaces in different project
- Integration test: global memory requires governance approval (mock)

---

### 6. **Retrieval Feedback Loop** (Priority: Medium)
**Impact:** Enables continuous improvement of 95.2% R@5 metric | **Effort:** Medium | **Breaking:** No

#### Problem
No signal flows back from agent outcomes to retrieval quality. If a recalled memory led the agent in the wrong direction, that information is lost forever.

#### Solution
Explicit feedback MCP tool + online learning on weights.

1. **New MCP tool: `memory_feedback`**
   ```typescript
   export interface MemoryFeedbackInput {
     sessionId: string;
     memoryId: string;
     searchQuery: string;
     helpful: boolean; // true = "this helped me", false = "this was wrong/irrelevant"
     context?: string; // e.g., "memory said X but we discovered Y"
   }

   export interface FeedbackRecord {
     id: string;
     sessionId: string;
     memoryId: string;
     searchQuery: string;
     helpful: boolean;
     context?: string;
     timestamp: string;
   }
   ```

2. **Store in KV:**
   ```typescript
   const KV_scope = "mem:feedback";
   await kv.set(KV_scope, feedbackId, feedback);
   ```

3. **Online weight tuning (background job):**
   ```typescript
   // Called periodically (e.g., post-session-end)
   export async function updateSearchWeights(kv: StateKV) {
     const feedbacks = await kv.list<FeedbackRecord>(KV.feedback, { limit: 1000 });
     
     // Compute helpfulness by search type
     const keywordHelpful = feedbacks.filter(f => 
       f.searchQuery.match(/[a-z_]+\.[a-z_]+/) // identifiers
     ).filter(f => f.helpful).length;
     const conceptualHelpful = feedbacks.filter(f => 
       f.searchQuery.split(' ').length > 3 && !f.searchQuery.match(/\//)
     ).filter(f => f.helpful).length;
     
     // Adjust weights: keyword queries doing better? boost BM25
     const newBm25Weight = 0.4 + (keywordHelpful > conceptualHelpful ? 0.1 : -0.05);
     await config.set('BM25_WEIGHT', newBm25Weight);
   }
   ```

4. **UI feedback button:**
   - When result is displayed, show thumbs-up/thumbs-down
   - Click → fires `memory_feedback` tool

#### Files to Change
- `src/functions/feedback.ts` — New file
- `src/types.ts` — Add `FeedbackRecord`
- `src/mcp/tools-registry.ts` — Add `memory_feedback` tool
- `src/functions/update-weights.ts` — New file, online learning
- `src/viewer/document.ts` — Add feedback UI buttons

#### Testing
- Unit test: verify weight update direction based on feedback distribution
- Integration test: 100 feedback records, 70% keyword queries helpful → verify BM25 weight increases

---

### 7. **Proactive Warnings in `pre-tool-use` Hook** (Priority: Medium)
**Impact:** Prevents repeated mistakes | **Effort:** Low | **Breaking:** No

#### Problem
The `pre-tool-use` hook exists but is passive—it only injects context when explicitly queried. It could proactively warn the agent before repeating a known mistake.

#### Solution
Pattern-match against `bug` memories and surface warnings.

1. **Enhance `src/hooks/pre-tool-use.ts`:**
   ```typescript
   // Existing: inject context on demand
   // New: also check for warnings
   
   export async function preToolUse(payload: ToolUsePayload) {
     const sessionId = payload.sessionId;
     const toolName = payload.toolName;
     const toolInput = JSON.stringify(payload.toolInput);
     
     // Search for related bug memories
     const bugMemories = await search('bugs about ' + toolName, { type: ['bug'] });
     
     // Pattern match against tool input
     const warnings: string[] = [];
     for (const bug of bugMemories) {
       // Extract patterns from bug content (e.g., "avoid: rm -rf", "don't: git push --force")
       const patterns = extractDangerPatterns(bug.content);
       for (const pattern of patterns) {
         if (toolInput.includes(pattern)) {
           warnings.push(`⚠️ Warning: Past session noted: ${bug.title}`);
         }
       }
     }
     
     if (warnings.length > 0 && process.env.AGENTMEMORY_PROACTIVE_WARNINGS === 'true') {
       return {
         context: injectedContext,
         warnings,
       };
     }
     
     return { context: injectedContext };
   }

   function extractDangerPatterns(content: string): string[] {
     // Extract sentences starting with "avoid:", "don't:", "never:"
     const match = content.match(/(?:avoid|don't|never):\s*(.+?)(?:\.|$)/gi);
     return match ? match.map(m => m.replace(/(?:avoid|don't|never):\s*/, '')) : [];
   }
   ```

2. **Config flag:**
   ```bash
   AGENTMEMORY_PROACTIVE_WARNINGS=true
   ```

#### Files to Change
- `src/hooks/pre-tool-use.ts` — Add warning logic
- `src/config.ts` — Add `AGENTMEMORY_PROACTIVE_WARNINGS` flag
- `src/types.ts` — Extend HookResponse to include warnings[]

#### Testing
- Unit test: mock bug memory about `rm -rf`, verify warning on matching tool input
- Integration test: run agent that calls dangerous command, verify warning injected

---

### 8. **Staleness Detection for File Paths** (Priority: Medium)
**Impact:** Improves accuracy of file-related recall | **Effort:** Low | **Breaking:** No

#### Problem
`Memory.files[]` stores file paths. If those files are deleted or renamed, the memory silently becomes stale. A memory about `/src/auth/jwt.ts` is misleading if that file was deleted 3 months ago.

A `stale?: boolean` flag already exists on `GraphNode` and `GraphEdge` — but nothing sets it from filesystem reality, and `Memory` has no equivalent field.

#### Solution
Background staleness check at session-start; reuse the existing `stale` convention from the graph layer.

1. **New function: `check-file-staleness.ts`**
   ```typescript
   export async function checkFilesStaleness(
     memories: Memory[],
     projectCwd: string
   ): Promise<Map<string, boolean>> {
     const staleness = new Map<string, boolean>();
     
     for (const mem of memories) {
       for (const filePath of mem.files || []) {
         const fullPath = path.join(projectCwd, filePath);
         const exists = fs.existsSync(fullPath);
         if (!exists) {
           staleness.set(mem.id, true);
           break;
         }
       }
     }
     
     return staleness;
   }
   ```

2. **In `session-start.ts` hook:**
   ```typescript
   const sessionMemories = await search('...', { sessionId });
   const staleMemories = await checkFilesStaleness(sessionMemories, cwd);
   
   for (const [memId, isStale] of staleMemories) {
     if (isStale) {
       await updateMemory(memId, { stale: true });
     }
   }
   ```

3. **Add to `Memory`:**
   ```typescript
   interface Memory {
     // existing...
     stale?: boolean;
     staleReason?: "file_deleted" | "file_renamed" | "codebase_refactored";
     staledAt?: string;
   }
   ```

4. **In search results:**
   ```typescript
   // Lower score for stale memories
   if (result.memory.stale) {
     result.combinedScore *= 0.5;
   }
   ```

5. **UI warning:**
   - Show badge "⚠️ File deleted" on stale memories in viewer

#### Files to Change
- `src/functions/check-file-staleness.ts` — New file
- `src/types.ts` — Add `stale`, `staleReason`, `staledAt`
- `src/hooks/session-start.ts` — Call staleness check
- `src/state/hybrid-search.ts` — Apply stale penalty
- `src/viewer/document.ts` — Show stale badge

#### Testing
- Unit test: verify staleness detection for deleted files
- Integration test: create memory with file reference, delete file, verify stale flag on next session-start

---

### 9. **Adaptive Search Weight Tuning** (Priority: Medium)
**Impact:** Improves recall precision without manual tuning | **Effort:** Medium | **Breaking:** No

#### Problem
[hybrid-search.ts:27-31](src/state/hybrid-search.ts#L27-L31) defaults weights to `bm25=0.4, vector=0.6, graph=0.3`. These are already overridable via env (`BM25_WEIGHT` in [config.ts:223](src/config.ts#L223)), but they're static per-process: a query full of exact identifiers gets the same vector-heavy blend as a vague conceptual question. The gap is **per-query** adaptation, not configurability.

#### Solution
Classify query type and adjust weights dynamically.

1. **Query classifier:**
   ```typescript
   type QueryType = "keyword" | "conceptual" | "temporal" | "entity";

   function classifyQuery(query: string): { type: QueryType; confidence: number } {
     // Keyword: many specific identifiers, file paths, function names
     const identifierDensity = (query.match(/[a-z_]+\.[a-z_]+/g) || []).length / query.split(' ').length;
     if (identifierDensity > 0.3) return { type: "keyword", confidence: 0.9 };
     
     // Temporal: dates, "last week", "when did"
     if (/\b(last|this|when did|recently|ago)\b/i.test(query)) return { type: "temporal", confidence: 0.8 };
     
     // Entity: specific names, "author said", "in file X"
     if (/\b(in|by|from|author)\b/i.test(query)) return { type: "entity", confidence: 0.7 };
     
     // Conceptual: vague, multi-word, natural language
     return { type: "conceptual", confidence: 0.6 };
   }
   ```

2. **Adaptive weights:**
   ```typescript
   async tripleStreamSearch(query: string, limit: number) {
     const classification = classifyQuery(query);
     
     let weights = { bm25: 0.4, vector: 0.6, graph: 0.3 };
     
     if (classification.type === "keyword") {
       weights = { bm25: 0.7, vector: 0.2, graph: 0.1 };
     } else if (classification.type === "conceptual") {
       weights = { bm25: 0.2, vector: 0.7, graph: 0.1 };
     } else if (classification.type === "entity") {
       weights = { bm25: 0.3, vector: 0.4, graph: 0.3 };
     } else if (classification.type === "temporal") {
       weights = { bm25: 0.5, vector: 0.3, graph: 0.2 };
     }
     
     // Optionally use feedback history to fine-tune further
     const learnedWeights = await getLearnedWeights(classification.type);
     Object.assign(weights, learnedWeights);
     
     return this.fusion(bm25Results, vectorResults, graphResults, weights);
   }
   ```

3. **Telemetry:**
   ```typescript
   // Track which weights work best per query type
   await recordTelemetry('search_weight_applied', {
     queryType: classification.type,
     weights,
     resultCount,
     topResultRelevance,
   });
   ```

#### Files to Change
- `src/state/hybrid-search.ts` — Add query classification and adaptive weights
- `src/telemetry/setup.ts` — Record weight application events
- `src/functions/update-weights.ts` — Use telemetry to learn optimal weights per query type

#### Testing
- Unit test: verify keyword query gets high BM25 weight
- Unit test: verify conceptual query gets high vector weight
- Integration test: run 100 mixed queries, verify each type gets appropriate weight

---

### 10. **Importance Calibration by Observation Type** (Priority: Low)
**Impact:** Improves consistency of importance scoring | **Effort:** Low | **Breaking:** No

#### Problem
The `importance` field (0–1) on `CompressedObservation` is set by the LLM during compression but there's no calibration. The model may consistently over- or under-rate certain tool types (e.g., `file_read` observations always 0.2, but they should average 0.5).

#### Solution
Track importance distribution per type and apply floor/ceiling.

1. **In telemetry:**
   ```typescript
   // After compress, record importance
   await recordTelemetry('observation_importance', {
     type: obs.type,
     importance: obs.importance,
     toolName: obs.toolName,
   });
   ```

2. **Calibration routine (background job):**
   ```typescript
   export async function calibrateImportance() {
     const events = await telemetry.query({
       metric: 'observation_importance',
       limit: 10000,
     });
     
     // Compute median per type
     const medianByType = new Map<ObservationType, number>();
     for (const type of ALL_TYPES) {
       const values = events
         .filter(e => e.type === type)
         .map(e => e.importance)
         .sort((a, b) => a - b);
       medianByType.set(type, values[Math.floor(values.length / 2)]);
     }
     
     // Store calibration
     await config.set('IMPORTANCE_MEDIAN', medianByType);
   }
   ```

3. **Apply floor/ceiling during compress:**
   ```typescript
   const calibration = await config.get('IMPORTANCE_MEDIAN');
   const median = calibration.get(obs.type) ?? 0.5;
   const range = 0.3; // ±30% around median
   
   obs.importance = Math.max(median - range, Math.min(median + range, obs.importance));
   ```

4. **Health endpoint:**
   ```typescript
   GET /agentmemory/health
   → { ..., importanceStats: {
       file_read: { median: 0.3, samples: 450 },
       file_write: { median: 0.7, samples: 280 },
       ...
     }
   }
   ```

#### Files to Change
- `src/functions/compress.ts` — Apply calibration floor/ceiling
- `src/telemetry/setup.ts` — Record importance by type
- `src/functions/calibrate-importance.ts` — New file, compute medians
- `src/triggers/api.ts` — Add importance stats to health endpoint

#### Testing
- Unit test: mock telemetry with known distribution, verify calibration limits applied
- Integration test: compress 100 observations, verify importance in range [median ± 30%]

---

### 11. **Graph Export to Standard Formats** (Priority: Low)
**Impact:** Enables external analysis | **Effort:** Medium | **Breaking:** No

#### Problem
The knowledge graph (nodes in `mem:graph:nodes`, edges in `mem:graph:edges`) is only accessible via MCP tools. It can't be analyzed in Gephi, Neo4j, or other graph tools.

#### Solution
Export to GraphML (Gephi/yEd) and Cypher (Neo4j) formats.

1. **New endpoint: `POST /agentmemory/export/graphml`**
   ```typescript
   export async function exportGraphML(kv: StateKV): Promise<string> {
     const nodes = await kv.list<GraphNode>(KV.graphNodes);
     const edges = await kv.list<GraphEdge>(KV.graphEdges);
     
     let xml = `<?xml version="1.0" encoding="UTF-8"?>
   <graphml xmlns="http://graphml.graphdrawing.org/xmlformat/graphmlml.xsd">
     <graph edgedefault="undirected">`;
     
     for (const node of nodes) {
       xml += `\n      <node id="${node.id}" label="${escapeXml(node.name)}">
         <data key="type">${node.type}</data>
         <data key="occurrences">${node.occurrences}</data>
       </node>`;
     }
     
     for (const edge of edges) {
       xml += `\n      <edge source="${edge.sourceNodeId}" target="${edge.targetNodeId}" label="${edge.type}">
         <data key="weight">${edge.weight}</data>
         <data key="frequency">${edge.frequency}</data>
       </edge>`;
     }
     
     xml += `\n    </graph>\n  </graphml>`;
     return xml;
   }
   ```

2. **New endpoint: `POST /agentmemory/export/cypher`**
   ```typescript
   export async function exportCypher(kv: StateKV): Promise<string> {
     const nodes = await kv.list<GraphNode>(KV.graphNodes);
     const edges = await kv.list<GraphEdge>(KV.graphEdges);
     
     let cypher = '';
     
     for (const node of nodes) {
       cypher += `CREATE (${node.id}:${capitalize(node.type)} {name: "${escapeCypher(node.name)}", occurrences: ${node.occurrences}});\n`;
     }
     
     for (const edge of edges) {
       cypher += `MATCH (a {name: "${escapeCypher(edge.sourceNodeId)}"}), (b {name: "${escapeCypher(edge.targetNodeId)}"}) CREATE (a)-[:${edge.type} {weight: ${edge.weight}, frequency: ${edge.frequency}}]->(b);\n`;
     }
     
     return cypher;
   }
   ```

3. **In `api.ts`:**
   ```typescript
   sdk.registerEndpoint("POST", "/agentmemory/export/graphml", async (req, res) => {
     const graphml = await exportGraphML(kv);
     res.set('Content-Type', 'application/xml');
     res.send(graphml);
   });

   sdk.registerEndpoint("POST", "/agentmemory/export/cypher", async (req, res) => {
     const cypher = await exportCypher(kv);
     res.set('Content-Type', 'text/plain');
     res.send(cypher);
   });
   ```

#### Files to Change
- `src/functions/export-graph.ts` — New file, GraphML and Cypher formatters
- `src/triggers/api.ts` — Register `/export/graphml` and `/export/cypher` endpoints
- Documentation: add export format examples

#### Testing
- Unit test: verify GraphML output is valid XML
- Unit test: verify Cypher syntax is valid (can parse with regex)
- Integration test: export graph, import to Neo4j, verify node/edge counts match

---

## Implementation Roadmap

### Phase 1 (Weeks 1–2): Security & Correctness
1. **Close Scrubbing Bypass Paths** (#4) — Critical; scrubbing exists but only on the hook path
2. **Temporal Decay on `Memory`** (#1) — Extend existing decay machinery into search ranking
3. **Semantic Deduplication** (#2) — Improve index quality

### Phase 2 (Weeks 3–4): Intelligence & Detection
4. **Conflict Detection** (#3) — Prevent contradictory recall
5. **Staleness Detection** (#8) — Mark stale information
6. **Proactive Warnings** (#7) — Prevent mistakes

### Phase 3 (Weeks 5–6): Feedback & Learning
7. **Feedback Loop** (#6) — Enable online learning
8. **Adaptive Weights** (#9) — Query-aware tuning
9. **Importance Calibration** (#10) — Consistency

### Phase 4 (Weeks 7–8): Scope & Portability
10. **Cross-Project Scope** (#5) — Multi-project reuse
11. **Graph Export** (#11) — External analysis

---

## Effort & Impact Matrix

| # | Feature | Impact | Effort | Duration | Blocking |
|---|---|---|---|---|---|
| 4 | Close Scrubbing Bypass Paths | Critical | Low–Medium | 2–3 days | No |
| 1 | Temporal Decay | High | Low | 2–3 days | No |
| 2 | Semantic Dedup | High | Medium | 4–5 days | No |
| 3 | Conflict Detection | High | High | 5–6 days | No |
| 8 | Staleness Detection | Medium | Low | 2 days | No |
| 6 | Feedback Loop | Medium | Medium | 4–5 days | No |
| 7 | Proactive Warnings | Medium | Low | 2 days | No |
| 9 | Adaptive Weights | Medium | Medium | 3–4 days | No |
| 5 | Cross-Project Scope | Medium | Medium | 4 days | No |
| 10 | Importance Calibration | Low | Low | 1–2 days | No |
| 11 | Graph Export | Low | Medium | 3–4 days | No |

**Total Estimated Effort:** 8–9 weeks for all 11 enhancements.  
**Critical Path (must do first):** #4 (PII), #1 (Decay), #2 (Dedup) — together form retrieval quality foundation.

---

## Testing Strategy

### Unit Tests (Per Feature)
- Regex pattern detection (secrets)
- Decay formula (temporal)
- Similarity threshold (dedup)
- Query classification (adaptive weights)

### Integration Tests (Cross-System)
- End-to-end observation → compress → search → recall
- Session-end consolidation with conflict detection
- Feedback loop: simulate helpful/unhelpful feedback, verify weight adjustment

### Benchmarking
- **Baseline:** 95.2% R@5 on LongMemEval
- **Post-Dedup:** Expected R@5 → 96.5% (fewer noise results)
- **Post-Feedback:** Expected R@5 → 97.0% (learned weights)
- **Post-Decay:** Expected R@5 → 97.2% (recent memories ranked higher)

### Security Audit
- Scrub test database with 10 known secret patterns
- Verify 100% redaction in stored observations
- No secrets in exports or audit logs

---

## Configuration & Defaults

New environment variables:

```bash
# Feature flags
AGENTMEMORY_TEMPORAL_DECAY=true                 # Enable decay formula
AGENTMEMORY_SEMANTIC_DEDUP=true                 # Enable dedup check
AGENTMEMORY_CONFLICT_DETECTION=true             # Enable contradiction detection
AGENTMEMORY_PROACTIVE_WARNINGS=true             # Warn before mistakes
AGENTMEMORY_FILE_STALENESS_CHECK=true           # Check file existence
AGENTMEMORY_ADAPTIVE_SEARCH_WEIGHTS=true        # Query-adaptive tuning

# Tuning parameters
TEMPORAL_DECAY_LAMBDA=0.01                      # Decay rate (0.01 = 1% per day)
DEDUP_SIMILARITY_THRESHOLD=0.92                 # Cosine similarity for merge
IMPORTANCE_CALIBRATION_RANGE=0.3                # ±30% around median
FEEDBACK_WEIGHT_UPDATE_INTERVAL=86400           # 1 day in seconds
```

Defaults: all features enabled except those with runtime costs (dedup, conflicts search, weight tuning).

---

## Monitoring & Observability

### New Metrics (OpenTelemetry)
- `observation.semantic_dedup.merged` — Counter, dedup merge events
- `memory.conflict_detection.found` — Counter, contradictions found
- `search.adaptive_weights.applied` — Gauge, actual weights per query type
- `observation.secrets_detected` — Counter, secrets found and redacted
- `memory.staleness.files_missing` — Gauge, stale files per session

### Dashboard (Prometheus)
```
Temporal Decay
├─ avg_decayed_strength (over time)
└─ recall_freshness (% results < 30 days old)

Dedup & Quality
├─ merge_rate (merged / total observations)
├─ unique_concept_coverage (new concepts / total)
└─ result_noise (duplicate concepts in top-5)

Feedback Loop
├─ helpful_feedback_ratio (helpful / total)
├─ weight_adjustment_magnitude (Δ per update)
└─ r@5_trend (toward 97%+ goal)

Security
├─ secrets_detected (absolute count)
└─ sanitization_rate (% of observations scrubbed)
```

---

## Summary of Value

Implementing these 11 enhancements would transform AgentMemory from a "capture and search" system into a **self-improving, safety-first, context-aware memory layer**:

- **Security:** Close the unscrubbed ingestion paths (manual saves, imports, lessons, slots, LLM compression output)
- **Relevance:** Improve R@5 from 95.2% to 97%+ (decay + dedup + feedback)
- **Correctness:** Prevent contradictory recall (conflict detection)
- **Usability:** Warn before mistakes (proactive warnings), work across projects (cross-project scope)
- **Portability:** Analyze memory in external tools (graph export)
- **Sustainability:** Detect and flag stale information (staleness detection)

**Recommended Quick Wins (Weeks 1–2):**
1. Close Scrubbing Bypass Paths (#4) — mostly wiring an existing function into 7 more write paths
2. Temporal Decay on `Memory` (#1) — extending existing `DecayConfig` machinery, not building new
3. Semantic Deduplication (#2)

These three alone would resolve the biggest risks (security, quality, noise) and establish the foundation for the rest. Notably, #4 and #1 are cheaper than they first appear because the underlying primitives (`stripPrivateData`, `DecayConfig`, retention scoring) already exist — the work is integration, not invention.
