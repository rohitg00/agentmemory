# Causal Lesson Schema v1

Status: PR1 foundation

Scope: additive lesson schema, normalization, validation, and lifecycle invariants

Out of scope: hybrid/vector retrieval, near-duplicate ranking, sensitivity enforcement, automatic contradiction discovery, and deployment

## Authority and compatibility

Lessons remain in the existing iii-engine `mem:lessons` KV scope. Every write
continues through a registered AgentMemory function. This schema adds no
database, graph authority, migration worker, MCP tool, or REST endpoint.

The JSON export envelope remains compatible with version `0.9.27`. New lesson
fields are optional in `ExportData`, so no package/export version bump is
required for this additive change. Export returns normalized schema-v1 lesson
records. Import validates and normalizes lesson records before any replace
mutation.

Stored legacy lessons are not rewritten by reads. Recall, list, context, JSON
export, and Obsidian export normalize them in memory to:

- `schemaVersion: 1`
- `identityKind: "legacy-prose"` and a canonical `lsn_*` alias
- `evidenceVerdict: "unverified"`
- `lifecycle: "active"` unless correction metadata proves supersession or retraction
- `scope: { ring: "worktree" }`
- `sensitivity: "restricted"`
- empty structured arrays/maps
- a deterministic `contentFingerprint`

The legacy `project` field remains a label and compatibility filter. It is not
used as a durable cross-repository join key for structured corrections.
Malformed rows carrying schema-v1 or structured markers never fall back to
legacy defaults. Export rejects them with the field diagnostic and leaves the
raw row untouched; `mem::diagnose` reports them as invalid structured lessons.

## Causal identity and claim

A structured causal lesson uses:

- `mechanismId`: canonical, lowercase mechanism identity
- `mechanismVersion`: optional version within that identity
- `mechanismAliases`: at most eight prior or alternate identities
- `claim`: a short falsifiable statement, separate from explanatory `content`
- `claimType`: `causal`, `predictive`, `procedural`, `constraint`, or `descriptive`

If any causal structure is supplied, both `mechanismId` and `claim` are
required. Legacy prose-only saves remain valid.

Structured saves, structured imports, and replay-derived lessons all use the
same canonical `lsn_*` identity helper. Import deterministically remaps a
caller-provided structured ID and records it in `idAliases`. Two rows claiming
the same canonical ID or alias are rejected. Prose IDs are preserved only when
the normalized row explicitly carries `identityKind: "legacy-prose"`;
canonical aliases prevent replay/save duplicates during the compatibility
window.

## Evidence verdict and lifecycle

Evidence and lifecycle are independent:

| Dimension | Values | Meaning |
| --- | --- | --- |
| `evidenceVerdict` | `supported`, `refuted`, `mixed`, `unverified` | Current evidence assessment |
| `lifecycle` | `draft`, `active`, `superseded`, `retracted` | Record publication/correction state |

A refuted active lesson remains recallable negative evidence. Recall payloads
retain the verdict, and injected context labels it explicitly so refutation is
not presented as a supported instruction. Compact smart-search results also
retain `claim`, `evidenceVerdict`, an explicit evidence label, and contradiction
state. Reflection places refuted/contradicted lessons in a separate
counterevidence section and refuses to persist a supported synthesis from a
cluster containing that evidence. Retraction means the evidence itself is
invalid. Supersession means another active lesson replaces this record.

Normal save calls may create only draft or active records. Terminal lifecycle
changes reuse the audited correction functions:

- `mem::lesson-supersede` sets `lifecycle: "superseded"` and preserves
  `supersededByLessonId`.
- `mem::lesson-delete` is the backward-compatible retraction surface and sets
  `lifecycle: "retracted"`.

Both operations retain the legacy tombstone fields so older consumers continue
to exclude corrected lessons.

## Applicability and facets

The schema is domain-neutral:

- `applicabilityConditions`
- `nonApplicabilityConditions`
- `falsificationConditions`
- `structuredFacets: Record<string, string[]>`

Facet dimensions normalize spaces/hyphens to underscores and must then be
ASCII snake case matching `^[a-z][a-z0-9_]*$`. Slashes, punctuation, Unicode
letters, leading digits, and unsafe reserved names such as `constructor`,
`prototype`, and `__proto__` are rejected. Values remain general strings.
Trading examples such as `asset`, `venue`, `horizon`, `regime`, and
`signal_family` are conventions, not hard-coded schema dimensions.

Each condition list is bounded to 16 entries. Facets are bounded to 32
dimensions and 16 values per dimension.

## Durable evidence references

`evidenceRefs` contains at most eight records. Each reference requires:

- `kind`
- `projectId` as a label
- discriminated `provenance`
- explicit `verification`
- `recordedAt`

Provenance supports:

| Type | Required immutable identity |
| --- | --- |
| `git` | normalized remote plus full commit SHA and/or digest |
| `object-store` | immutable object/version ID and/or digest |
| `database-query` | immutable snapshot/query-result ID and/or digest |
| `oci` | digest |
| `doi` | valid DOI |
| `urn` | valid URN |
| `dataset` | immutable release ID and/or digest |
| `attestation` | digest |

Optional evidence fields remain `path`, `validatedAt`, `evidenceKind`, and
`sampleCount`. The old top-level Git shape (`repoRemoteUrl`, `commitSha`,
`artifactDigest`, `path`) remains import/read compatible and normalizes to
`provenance.type: "git"`.

Verification state is `unverified`, `verified`, or `rejected`. Verified and
rejected decisions require actor/time metadata. New supported, refuted, and
mixed saves require every reference to be explicitly verified; a syntactically
immutable locator alone is not evidence-relevance approval.

Older Git-shaped supported/refuted/mixed rows that predate verification
metadata are not rejected or downgraded. Import/read normalization assigns:

```json
{
  "state": "verified",
  "basis": "legacy-git-anchor",
  "verifiedBy": "agentmemory:legacy-git-anchor-migration",
  "verifiedAt": "<validatedAt or recordedAt>"
}
```

This explicit compatibility basis preserves the prior verdict. It does not
assert that relevance was newly audited. New REST/MCP saves cannot select the
reserved migration basis. Import/read normalization accepts it only for
immutable Git provenance with
`verifiedBy: "agentmemory:legacy-git-anchor-migration"`; arbitrary migration
actors and all non-Git provenance types are rejected.

A branch, ref, or path without the immutable identity required by its
provenance type is rejected.

## Scope and sensitivity

`scope.ring` is one of:

- `worktree`
- `repo`
- `initiative`
- `domain`
- `global`

A structured causal lesson requires an explicit scope. A non-global scope
requires a separate durable `scope.scopeId`; global scope rejects `scopeId`.
`project`/`projectId` labels do not substitute for durable scope identity.
Legacy prose lessons retain the fail-closed implicit worktree scope for
compatibility.

In PR1, `scopeId`, `humanApproval.approvedBy`, and correction `actor` were
caller-supplied metadata only. The companion
[Causal Lesson Access v2](2026-08-03-causal-lesson-access-v2.md) defines the
opt-in server-resolved identity, approval authority, and durable-scope access
enforcement added in PR2.

Global scope requires:

```json
{
  "ring": "global",
  "humanApproval": {
    "approvedBy": "human identity",
    "approvedAt": "ISO-8601 timestamp",
    "reason": "approval rationale"
  }
}
```

All schema-v1 approval, evidence-recording, evidence-validation, verification,
and review timestamps require a calendar-valid RFC3339 timestamp with an
explicit `Z` or numeric offset. They canonicalize to UTC before storage or
fingerprinting. Timezone-less inputs and impossible dates such as February 30
are rejected.

Sensitivity is `public`, `internal`, `confidential`, or `restricted`, with a
fail-closed default of `restricted`.

PR1 records and returns scope/sensitivity metadata while preserving the
existing visibility behavior. Access v2 keeps that behavior as explicit
`classify` mode and adds opt-in `enforce` mode; callers must not treat
`sensitivity` as an access-control boundary unless enforcement is active.

## Confidence, reinforcement, staleness, and contradiction

`confidence` remains an explicit evidence assessment. Duplicate saves and
`mem::lesson-strengthen` increment reinforcement metadata and update its
timestamp without changing confidence.

Schema-v1 lessons are not confidence-decayed or soft-deleted by the legacy
decay sweep. `reviewAfter` computes `computedFlags.stale` at read time. The
optional `contradictedByLessonIds` relation metadata computes
`computedFlags.contradicted`. Neither flag changes lifecycle or confidence.
Contradiction targets must exist, remain active, differ from the source, and
share both durable scope and the current project label. The project-label
equality check is a PR1 fail-closed authority bound, not a cross-repository join
mechanism. Supersession targets must exist, remain active, differ from the
source, and share durable scope.

Pre-schema stored lessons retain the old decay behavior until an explicit
replay/import normalizes them. This preserves backward compatibility without a
background rewrite.

`computedFlags` is a read model only and is never persisted or accepted from
REST/MCP input.

## Deterministic fingerprints

Every normalized lesson returns `contentFingerprint`.

For prose-only lessons, the fingerprint uses normalized prose. For structured
causal lessons, it uses mechanism ID/version, claim/type, applicability,
non-applicability, falsification conditions, and structured facets. Explanatory
prose, evidence verdict, evidence anchors, lifecycle, popularity, and
confidence do not alter the content fingerprint.

Structured lesson IDs additionally include verdict, immutable evidence
references, scope, sensitivity, and review deadline. Lifecycle and relation
links do not alter identity, so an audited correction retains a stable lesson
ID and relation batches do not become recursively order-dependent. This allows
two records to share a causal content fingerprint while preserving distinct
evidence packages or verdicts for later near-duplicate analysis.

Object keys and unordered arrays are canonicalized before hashing. Fingerprint
comparison never relies on insertion order or raw `JSON.stringify` ordering.

## Boundary behavior

REST and MCP lesson-save handlers validate and whitelist structured fields
before calling `mem::lesson-save`. REST lesson search now whitelists its query
fields instead of forwarding the raw request body.

JSON import accepts only `merge`, `replace`, or `skip`. It canonicalizes
structured IDs, resolves aliases independent of batch order, validates the
complete post-import supersession/contradiction graph, bounds the collection,
strips computed read-model fields, and completes lesson preflight under the
shared lesson mutation lock.

Authoritative lesson enumeration and structured normalization fail closed.
Import performs no writes when its lesson preflight read fails and returns a
bounded diagnostic; portable export refuses to omit an unreadable lesson
store. Reflection aborts before provider invocation or insight persistence
when lesson enumeration or normalization fails.

Obsidian export renders discriminated provenance plus verification state
instead of assuming every anchor is Git. The viewer searches and displays
claim, verdict, lifecycle, durable scope, sensitivity, and computed
stale/contradicted flags.

Default merge never replaces a retracted/superseded row with a non-terminal
row. Whole-collection `replace` is the explicit restore path. Both successful
changes and restore transitions audit affected IDs and before/after lifecycle
metadata. Lesson delete/set application records the exact preimage; if a KV
operation fails mid-batch, import restores and verifies every affected row,
reports rollback failures explicitly, and writes a rollback audit when
possible. Save, correction, replay, decay, and import share the mutation lock,
so a concurrent correction cannot be resurrected between preflight and write.

No retrieval or ranking engine is introduced in this PR.
