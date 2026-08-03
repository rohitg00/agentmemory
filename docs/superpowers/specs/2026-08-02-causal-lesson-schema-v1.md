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
- `evidenceVerdict: "unverified"`
- `lifecycle: "active"` unless correction metadata proves supersession or retraction
- `scope: { ring: "worktree" }`
- `sensitivity: "restricted"`
- empty structured arrays/maps
- a deterministic `contentFingerprint`

The legacy `project` field remains a label and compatibility filter. It is not
used as a durable cross-repository join key for structured corrections.

## Causal identity and claim

A structured causal lesson uses:

- `mechanismId`: canonical, lowercase mechanism identity
- `mechanismVersion`: optional version within that identity
- `mechanismAliases`: at most eight prior or alternate identities
- `claim`: a short falsifiable statement, separate from explanatory `content`
- `claimType`: `causal`, `predictive`, `procedural`, `constraint`, or `descriptive`

If any causal structure is supplied, both `mechanismId` and `claim` are
required. Legacy prose-only saves remain valid.

## Evidence verdict and lifecycle

Evidence and lifecycle are independent:

| Dimension | Values | Meaning |
| --- | --- | --- |
| `evidenceVerdict` | `supported`, `refuted`, `mixed`, `unverified` | Current evidence assessment |
| `lifecycle` | `draft`, `active`, `superseded`, `retracted` | Record publication/correction state |

A refuted active lesson remains recallable negative evidence. Recall payloads
retain the verdict, and injected context labels it explicitly so refutation is
not presented as a supported instruction. Retraction means the evidence itself
is invalid. Supersession means another active lesson replaces this record.

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

Facet dimensions are normalized to lowercase snake case. Values remain general
strings. Trading examples such as `asset`, `venue`, `horizon`, `regime`, and
`signal_family` are conventions, not hard-coded schema dimensions.

Each condition list is bounded to 16 entries. Facets are bounded to 32
dimensions and 16 values per dimension.

## Durable evidence references

`evidenceRefs` contains at most eight records. Each reference requires:

- `kind`
- `projectId` as a label
- `repoRemoteUrl`
- at least one full immutable anchor: `commitSha` or `artifactDigest`
- `recordedAt`

Optional fields are `path`, `validatedAt`, `evidenceKind`, and `sampleCount`.
A branch, ref, or path without a full commit SHA or artifact digest is rejected.
Supported, refuted, and mixed verdicts require at least one valid evidence
reference.

## Scope and sensitivity

`scope.ring` is one of:

- `worktree`
- `repo`
- `initiative`
- `domain`
- `global`

A structured causal lesson requires an explicit scope. A non-global scope
requires a separate durable `scope.scopeId`. `project`/`projectId` labels do
not substitute for it. Legacy prose lessons retain the fail-closed implicit
worktree scope for compatibility.

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

Sensitivity is `public`, `internal`, `confidential`, or `restricted`, with a
fail-closed default of `restricted`.

PR1 records and returns scope/sensitivity metadata but deliberately preserves
the existing project-based visibility behavior. Retrieval enforcement belongs
to PR2. Until that lands, callers must not treat `sensitivity` as an enforced
access-control boundary.

## Confidence, reinforcement, staleness, and contradiction

`confidence` remains an explicit evidence assessment. Duplicate saves and
`mem::lesson-strengthen` increment reinforcement metadata and update its
timestamp without changing confidence.

Schema-v1 lessons are not confidence-decayed or soft-deleted by the legacy
decay sweep. `reviewAfter` computes `computedFlags.stale` at read time. The
optional `contradictedByLessonIds` relation metadata computes
`computedFlags.contradicted`. Neither flag changes lifecycle or confidence.

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
references, lifecycle, scope, sensitivity, review deadline, and contradiction
links. This allows two records to share a causal content fingerprint while
preserving distinct evidence packages or verdicts for later near-duplicate
analysis.

Object keys and unordered arrays are canonicalized before hashing. Fingerprint
comparison never relies on insertion order or raw `JSON.stringify` ordering.

## Boundary behavior

REST and MCP lesson-save handlers validate and whitelist structured fields
before calling `mem::lesson-save`. REST lesson search now whitelists its query
fields instead of forwarding the raw request body.

JSON import validates all lessons, bounds the collection, rejects duplicate
lesson IDs, recomputes deterministic fingerprints, and completes validation
before a replace strategy deletes existing state.

No retrieval or ranking engine is introduced in this PR.
