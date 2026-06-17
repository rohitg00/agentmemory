# 6. Design redacted provenance sidecar for memory_verify

Date: 2026-06-17

## Status

Accepted

## Context

`memory_verify` traces memory provenance through `sourceObservationIds`. In the current implementation, that trace depends on live compressed observation rows. If observations are deleted, expired, filtered during export/import, or otherwise unavailable, `memory_verify` cannot provide independent evidence for why a memory was created.

Issue #922 asks whether agentmemory should design a raw-anchor provenance sidecar for stronger auditability. The design has to respect privacy and retention constraints. It must not store raw prompts, raw tool inputs, raw tool outputs, assistant responses, or full raw hook payloads by default.

## Decision

Future implementation should use a redacted provenance sidecar keyed by memory ID, not raw transcript storage and not embedded memory-field expansion.

The sidecar should be modeled as a future `MemoryProvenanceAnchor` stored in a future KV scope named `mem:provenance:anchors`. It should contain bounded metadata and one aggregate fingerprint derived from privacy-stripped compressed observations:

- memory ID and sidecar version
- declared source observation IDs
- source observation ID, session ID, type, timestamp, title, concepts, files, confidence
- aggregate content fingerprint, using a local HMAC-SHA-256 key by default rather than exported unsalted per-fact hashes
- redaction policy metadata confirming raw payloads are not stored

The sidecar should live for the lifetime of the memory. Deleting a memory should delete its sidecar across user, governance, auto-forget, evict, and retention-evict deletion paths. Deleting observations should retain sidecars for surviving memories by default, because the sidecar is the audit evidence that explains memories after observation retention. A future explicit provenance purge option can be designed for stricter erasure workflows.

`memory_verify` should stay backward-compatible. Future response changes should be additive, with optional fields such as `sourceResolution`, `provenanceStatus`, and `sourceAnchors`. Existing REST and MCP request shapes should not change.

Export/import should include a future optional `provenanceAnchors` field only after a version bump and size validation. Full exports may include sidecars for exported memories. Current paginated export is session-based while memories are exported globally, so paginated exports should omit sidecars by default unless a future explicit option defines safe cross-page semantics. Older exports without sidecars must remain valid. Migration should be additive and lazy or opt-in; no backfill from raw logs should run by default.

This ADR records the design direction only. It does not implement the KV scope, persisted type, export/import field, migration, audit union member, or `memory_verify` response fields.

## Consequences

The project gets a concrete storage and API direction for stronger provenance auditability without making `memory_verify` depend on unavailable observations.

The design intentionally preserves less readable evidence than raw transcripts. It can prove source identity, timing, metadata, and content fingerprints, but it cannot reconstruct the deleted source text.

Implementation will touch persistence, export/import, deletion/governance, audit details, REST/MCP response shape, and tests. That work requires a separate implementation change with explicit schema/privacy contract review.

High-privacy deployments may still need a hash-only or disabled mode before implementation. The fingerprint keying and export behavior must be settled before code stores sidecar fingerprints.
