# Causal Lesson Access v2

Date: 2026-08-03
Status: implemented behind an opt-in enforcement mode; deployment and activation are out of scope
Depends on: [Causal Lesson Schema v1](2026-08-02-causal-lesson-schema-v1.md)
Out of scope: hybrid/vector retrieval, automatic contradiction discovery, deployment, token provisioning, and policy activation

## Objective

Make lesson scope and sensitivity an enforceable server boundary without
breaking existing installations. HTTP and MCP clients authenticate with a
unique raw token; the server resolves the principal from a policy containing
only token digests. Tool arguments and request bodies cannot grant access or
self-assert an actor.

## Modes

- `classify` is the default. It preserves PR1 read/write behavior while keeping
  scope and sensitivity metadata visible.
- `enforce` requires a readable, valid caller policy and matching client token
  for every boundary operation that reads or writes lessons. Missing policy
  returns 503; missing or invalid credentials return 401.

The mode is selected with `AGENTMEMORY_LESSON_ACCESS_MODE`. The policy path is
selected with `AGENTMEMORY_LESSON_CALLER_POLICY_FILE` and must be absolute.
Unknown mode values and relative policy paths fail closed.

## Caller policy

```json
{
  "version": 1,
  "principals": [
    {
      "principalId": "codex",
      "principalKind": "agent",
      "tokenSha256": "64-lowercase-hex-characters",
      "clearance": "confidential",
      "scopes": [
        {
          "ring": "repo",
          "scopeId": "repo:https://github.com/example/project",
          "access": "write"
        }
      ],
      "capabilities": []
    }
  ]
}
```

Principal IDs and token digests must be unique. Non-global grants require an
exact `scopeId`; global grants omit it. A write grant implies read. Global is
not a wildcard for other rings.

Supported capabilities are:

- `lesson:all-scopes`
- `lesson:approve-global`
- `lesson:export`
- `lesson:import`
- `lesson:legacy-worktree`

The sensitivity order is
`public < internal < confidential < restricted`. Access requires both adequate
clearance and a matching scope grant unless `lesson:all-scopes` is present.
`lesson:legacy-worktree` is a read-only exception for existing rows normalized
to an implicit worktree scope. New enforced writes require an explicit durable
scope unless they originate from the sealed internal service context.

## Boundary contract

Clients send:

- `X-AgentMemory-Caller-Token`: the raw per-client token
- `X-AgentMemory-Agent-Id`: the claimed principal ID, when known

The token is matched to `tokenSha256` with a timing-safe digest comparison. If
the optional claimed ID is present it must match the policy principal. The MCP
shim, streamable HTTP MCP bridge, bundled hooks, Pi, OpenCode, Hermes, and
OpenClaw integrations forward these headers from `AGENTMEMORY_CALLER_TOKEN`
and `AGENT_ID`.

The viewer uses a separate server-side identity from
`AGENTMEMORY_VIEWER_AGENT_ID` and `AGENTMEMORY_VIEWER_CALLER_TOKEN`. It ignores
browser-supplied caller identity headers and never embeds the caller token in
the rendered document. Integration plaintext-HTTP guards treat either
`AGENTMEMORY_SECRET` or `AGENTMEMORY_CALLER_TOKEN` as a credential.

Request bodies and MCP arguments are explicitly whitelisted. A supplied
`accessContext` is never forwarded by a public boundary. Direct iii function
calls must pass either a resolved context or the explicit service context.
Enforced contexts carry a process-local HMAC proof; unsigned or forged
classification/enforcement contexts normalize to an unresolved, no-scope
principal.

## Decision rules

- Save, strengthen, retract, and supersede require read/write authority for the
  affected durable scope and adequate sensitivity clearance.
- Recall, list, injected context, smart search, reflection, audit/diagnostic
  projections, crystal/insight reads, and exports filter unauthorized lessons
  before totals, ranking, provider prompts, or derived content are returned.
- Replay, crystallization, consolidation, eviction, reflection, audit, and
  diagnostics propagate a resolved caller. Scheduled maintenance alone may
  receive the sealed internal service context.
- Crystals persist `sourceLessonIds`; insights retain their lesson/crystal
  provenance. Every referenced lesson must be readable, and each crystal
  lesson value must correspond to its positional source lesson ID or
  authoritative content. A legacy crystal with lesson prose but no source IDs
  requires all-scopes authority in enforcement mode.
- Global saves require an authenticated `human` principal with
  `lesson:approve-global`; the server stamps `humanApproval.approvedBy` and
  `humanApproval.approvedAt`.
- In enforce mode correction actors are server-stamped.
- Portable full-database export/import and Obsidian exports containing lessons
  or crystals are operator-only in enforcement mode: `restricted` clearance,
  `lesson:all-scopes`, and the matching `lesson:export` or `lesson:import`
  capability are all required.
- Imports preflight collection shapes and every incoming lesson before any
  write, require authority for overwritten or replace-deleted lessons, and
  restore exact lesson preimages if a lesson-batch write fails. The KV
  abstraction has no transaction spanning all non-lesson collections, so a
  later full-import storage failure can still require operator repair.
- The internal service context can run scheduled maintenance across scopes but
  cannot approve global publication.

## Rollout

1. Keep `classify` active while inventorying every client.
2. Generate one high-entropy raw token per client and store it only in that
   client's secret environment.
3. Store only each token's SHA-256 digest in a root/operator-controlled policy
   file. Restrict policy-file permissions and do not commit it.
4. Configure `AGENT_ID` and `AGENTMEMORY_CALLER_TOKEN` for every REST/MCP
   client.
5. Validate read, write, correction, export, import, context, and scheduled
   maintenance behavior in a non-live instance.
6. Switch the server to `enforce`, restart it in a separately authorized
   deployment step, and verify 401/403/503 diagnostics plus authorized flows.

Rollback is configuration-only: return the server to `classify` and restart.
No lesson migration is required. Raw token rotation is performed by updating
the client secret and its policy digest together, then restarting/reloading the
affected processes.
