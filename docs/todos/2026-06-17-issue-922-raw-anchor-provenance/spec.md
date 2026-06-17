# Raw-Anchor Provenance Sidecar Design

## Problem

`memory_verify` currently proves provenance only when the referenced compressed observations still exist. Memories can declare `sourceObservationIds`, but a memory can outlive observation retention, session deletion, export/import filtering, or governance actions. Once an observation row is gone, live lookup cannot distinguish "never had sources" from "had sources that are no longer available" unless the memory itself carries enough durable provenance metadata.

Issue #922 asks for option 2 from the `memory_verify` provenance discussion: design a raw-anchor provenance sidecar that is persisted independently of observation availability, while respecting privacy and retention constraints.

## Decision Summary

Design a redacted, memory-scoped provenance sidecar for future implementation:

- Add a future KV scope named `KV.provenanceAnchors = "mem:provenance:anchors"` keyed by `memoryId`.
- Add a future `MemoryProvenanceAnchor` type that stores bounded, redacted anchor metadata for the source observations used to create or evolve a memory.
- Do not store raw prompts, raw tool inputs, raw tool outputs, assistant responses, or full raw observations by default.
- Keep `memory_verify` backward-compatible by adding optional fields instead of changing or removing existing fields.
- Delete sidecars when the memory is deleted, but retain redacted sidecars when only source observations are deleted unless the caller explicitly requests provenance purge.
- Include sidecars in export/import only after a versioned type and size-limit update.
- Make migration additive and opt-in or lazy; do not backfill from raw logs by default.

This task records the design only. It does not add the KV scope, persisted type, export/import field, migration, audit union member, or `memory_verify` response fields.

## Current Behavior Evidence

- `src/functions/verify.ts` reads `Memory.sourceObservationIds`, scans live observations, and returns `citations` for rows it can resolve.
- `test/verify.test.ts` covers successful citations, no source observations, direct observation verification, and supersede metadata, but does not cover missing/deleted/exported/imported source cases.
- `src/functions/remember.ts` persists `sourceObservationIds` on `Memory`, but no independent anchor metadata.
- `src/state/schema.ts` has no provenance sidecar KV scope.
- `src/types.ts` `ExportData` enumerates known export fields and has no sidecar field.
- `src/functions/export-import.ts` explicitly exports/imports each known scope and explicitly deletes known scopes during replace import.
- `src/functions/governance.ts` and `mem::forget` delete memories or observations without sidecar-specific behavior.
- The issue text says #241 added resolved/incomplete/absent source status, but this checkout does not currently include those fields.

## Proposed Data Model

Future KV scope:

```ts
provenanceAnchors: "mem:provenance:anchors";
```

Future sidecar type:

```ts
export interface MemoryProvenanceAnchor {
  memoryId: string;
  version: 1;
  createdAt: string;
  updatedAt: string;
  sourceObservationIds: string[];
  anchors: SourceObservationAnchor[];
  redaction: {
    policy: "metadata-aggregate-fingerprint-v1";
    fingerprintMode: "local-hmac-sha256";
    rawPayloadsStored: false;
    privateDataStripped: true;
  };
}

export interface SourceObservationAnchor {
  observationId: string;
  sessionId: string;
  observationType: ObservationType;
  timestamp: string;
  title?: string;
  concepts: string[];
  files: string[];
  confidence?: number;
  aggregateContentFingerprint: string;
  sourceAvailableAtWrite: boolean;
}
```

`aggregateContentFingerprint` should be a single aggregate fingerprint over bounded, privacy-stripped compressed observation content. The default implementation should use a local HMAC-SHA-256 key rather than an unsalted deterministic hash so exported fingerprints cannot be used for easy cross-dataset correlation or low-entropy guess confirmation. The canonicalized fingerprint input should enforce limits before hashing, such as maximum facts count, maximum bytes per fact, maximum narrative bytes, and maximum title bytes. Per-fact fingerprints are intentionally out of the default design because they create more guess-confirmation surface than an aggregate anchor.

The sidecar is keyed by `memoryId` because `memory_verify` starts with a memory ID and needs to evaluate all declared source IDs together. If a memory evolves, the new memory version gets its own sidecar keyed by the new memory ID. Superseded memories keep their sidecars while their memory rows exist.

## Write Path

Future implementation should create or update the sidecar where memory rows are created or evolved:

- `mem::remember` when a user saves a memory with `sourceObservationIds`.
- `mem::consolidate` when observations are consolidated into memories.
- Any future memory-evolution path that writes `sourceObservationIds`.

Write behavior:

- Build anchors from live compressed observations when available.
- If a declared observation is unavailable at write time, store its ID in `sourceObservationIds` but omit an anchor entry and record an unresolved count.
- Capture one `now` timestamp and reuse it for the sidecar row.
- Write the memory and sidecar in the same function invocation, but keep sidecar creation best-effort only if the memory write has already succeeded and anchor construction fails for non-critical lookup errors. The function should report sidecar write failure in safe diagnostics but must not store raw payloads as fallback.

## Verify Response Shape

Future `mem::verify` should preserve existing fields:

- `success`
- `type`
- `memory`
- `citations`
- `citationCount`

It may add optional fields:

```ts
sourceResolution: {
  declaredCount: number;
  resolvedCount: number;
  anchorCount: number;
  missingObservationIds: string[];
  status: "absent" | "resolved" | "incomplete";
};
provenanceStatus: "none" | "live" | "anchored" | "partial";
sourceAnchors: Array<{
  observationId: string;
  sessionId: string;
  observationType: ObservationType;
  timestamp: string;
  title?: string;
  concepts: string[];
  files: string[];
  confidence?: number;
  aggregateContentFingerprint: string;
  sourceAvailable: boolean;
}>;
```

Suggested status rules:

- `sourceResolution.status = "absent"` when a memory has no declared `sourceObservationIds`.
- `sourceResolution.status = "resolved"` when every declared source ID resolves to a live observation.
- `sourceResolution.status = "incomplete"` when at least one declared source ID is missing.
- `provenanceStatus = "none"` when no declared IDs and no sidecar exist.
- `provenanceStatus = "live"` when all declared IDs resolve live and no sidecar is needed to explain provenance.
- `provenanceStatus = "anchored"` when live observations are missing but sidecar anchors exist for every missing declared ID.
- `provenanceStatus = "partial"` when some declared IDs are neither live nor anchored.

REST and MCP wrappers should continue serializing the `mem::verify` result as JSON. Existing clients that ignore unknown fields remain compatible.

## Privacy And Retention

The sidecar must be metadata-only by default:

- No raw hook payloads.
- No raw prompts.
- No raw tool inputs or outputs.
- No assistant responses.
- No full `RawObservation.raw`.
- No full compressed observation `facts` or `narrative` text unless a future explicit opt-in privacy contract is approved.

Allowed fields are already-compressed metadata and hashes:

- observation ID, session ID, observation type, timestamp
- title, concepts, files, confidence
- one aggregate HMAC fingerprint of bounded, privacy-stripped compressed facts/narrative

Retention defaults:

- Sidecars live for the same lifetime as their memory.
- Deleting observations does not automatically delete memory sidecars, because the sidecar is the audit evidence explaining why a memory exists after observation retention.
- Deleting a memory deletes its sidecar by default.
- A future explicit purge option may delete sidecars that reference selected observations.

If a future retention policy needs stricter privacy, add a configuration flag before implementation, such as `AGENTMEMORY_PROVENANCE_ANCHORS=off|metadata|hash-only`, defaulting to `metadata`.

## Deletion And Governance

Future deletion behavior should be explicit:

- `mem::forget({ memoryId })`: delete the memory, access log, search/vector index entries, and provenance sidecar for that memory.
- `mem::governance-delete`: delete sidecars for deleted memory IDs.
- `mem::governance-bulk`: delete sidecars for every successfully deleted memory ID.
- `mem::forget({ sessionId, observationIds })`: delete observations but retain sidecars by default; add audit details listing retained sidecar count.
- `mem::forget({ sessionId })`: delete session and observations but retain sidecars for surviving memories unless the caller requests provenance purge.
- `mem::auto-forget`: delete sidecars when it deletes memories; retain sidecars and record retained counts when it deletes observations only.
- `mem::evict`: delete sidecars when it evicts memories; retain sidecars and record retained counts when it evicts observations only.
- `mem::retention-evict`: delete sidecars for evicted memories.

If a caller needs right-to-erasure semantics for source observations, future API work should add an explicit `purgeProvenanceAnchors` option with clear documentation. That option changes privacy/governance behavior and needs separate approval before implementation.

## Export, Import, And Migration

Future `ExportData` should add an optional field only after a version bump:

```ts
provenanceAnchors?: MemoryProvenanceAnchor[];
```

Export/import requirements:

- Full export includes sidecars for all exported memories.
- Current paginated export is session-based, while memories are exported globally. To avoid leaking sidecars for memories whose source sessions/observations are outside the exported session slice, paginated export should omit `provenanceAnchors` by default unless a later explicit export option defines a memory-scoped export mode.
- If a future paginated export includes sidecars, it must include only sidecars whose memory is exported and whose anchor session IDs are all in the exported session slice, or it must document that sidecars intentionally cross the session page boundary.
- Import validates array shape and enforces a maximum count and maximum anchors per memory.
- Import `skip` does not overwrite an existing sidecar.
- Import `merge` writes sidecars for imported memories.
- Import `replace` deletes existing sidecars along with memories and then imports the new sidecars.
- Older exports without `provenanceAnchors` remain valid.
- New exports should be rejected by older versions through the existing version gate.

Migration posture:

- No mandatory migration is needed to deploy the future field if the sidecar scope is optional.
- Existing memories without sidecars verify with live observations and report `provenanceStatus = "none"` or `partial` as appropriate.
- Optional future backfill may build sidecars only from live compressed observations, not raw JSONL logs or raw hook payloads.

## Audit Operations

The simplest future path is to reuse existing audit operations and enrich details:

- `remember` or `evolve`: include `provenanceAnchorWritten: true`, `anchorCount`, and `declaredSourceCount`.
- `forget` or `delete`: include `provenanceAnchorsDeleted` or `provenanceAnchorsRetained`.
- `import`: include imported sidecar counts.
- `export`: no audit exists for regular export today; if export audit is added later, include exported sidecar counts.

If the project wants a standalone operation, add a future `AuditEntry.operation` member such as `provenance_anchor_write`. That requires the repo consistency rule for new audit operations and should be part of implementation, not this design-only task.

## Backward Compatibility

Backward-compatible constraints:

- Existing memories remain valid without sidecars.
- Existing `memory_verify` clients keep receiving current fields.
- REST `/agentmemory/verify` and MCP `memory_verify` keep their request shape.
- New fields are additive and optional.
- Export/import accepts older exports without sidecars.
- No `memory_verify` behavior depends on sidecars until schema/privacy/deletion/export contracts are implemented.

The issue's option-1 fields are not present in this checkout. Future implementation should first reconcile the current branch with the #241 fix or reintroduce those fields with tests before layering sidecar status on top.

## Acceptance Tests

Future implementation should add tests before code changes:

- `mem::verify` returns `sourceResolution.status = "absent"` for memories without `sourceObservationIds`.
- `mem::verify` returns `resolved` and live citations when all declared observations exist.
- `mem::verify` returns `incomplete` plus `missingObservationIds` when declared observations are missing and no sidecar exists.
- `mem::verify` returns `anchored` or `partial` when observations are missing but sidecar anchors exist.
- `mem::forget({ observationIds })` removes observations but preserves sidecars by default.
- `mem::forget({ memoryId })` deletes the memory sidecar.
- `mem::governance-delete` deletes sidecars for deleted memories.
- `mem::governance-bulk` deletes sidecars for successfully deleted memories.
- `mem::auto-forget` deletes sidecars for automatically deleted memories and records retained sidecar counts for observation-only deletion.
- `mem::evict` deletes sidecars for evicted memories and records retained sidecar counts for observation-only eviction.
- `mem::retention-evict` deletes sidecars for evicted memories.
- `mem::export` includes sidecars for exported memories when the field exists.
- Paginated `mem::export` omits sidecars by default or proves sidecars are limited to the exported session slice.
- `mem::import` merge/skip/replace handles sidecars and validates limits.
- Older export payloads without `provenanceAnchors` still import.
- MCP `memory_verify` and REST `/agentmemory/verify` expose additive fields without changing request validation.

## Non-Goals

- No raw prompt/tool/assistant payload storage by default.
- No reconstruction of deleted observations.
- No reliance on Claude JSONL or hook raw payload history for backfill.
- No migration against existing data in this task.
- No new MCP tool, REST endpoint, or public response change in this task.
- No broad redesign of memory, observation, retention, or governance subsystems.

## Open Follow-Ups

- Decide whether the sidecar should default to metadata-plus-hashes or hash-only for high-privacy deployments.
- Decide whether `provenanceAnchors` belongs in paginated export behind an explicit export option or remains full-export-only.
- Decide whether observation erasure must purge surviving memory sidecars by default in any compliance mode.
- Reconcile this checkout with the #241 option-1 source-resolution fields before implementation.
