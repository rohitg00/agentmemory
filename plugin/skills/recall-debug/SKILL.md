---
name: recall-debug
description: Inspect agentmemory recall traces to explain selected and dropped context. Use when the user asks why a memory was recalled, why context was omitted, or whether retrieval degraded.
argument-hint: "[trace id, memory id, or query]"
user-invocable: true
---

## Quick start

Call `memory_recall` with `outputMode: "structured"`, then inspect its trace id
with the recall debug endpoint or `memory_why`.

## Why

Use persisted evidence, not inferred explanations. A trace is authoritative for
channel health, scope decisions, budget drops, and selected context.

## Workflow

1. Resolve the supplied trace id or memory id.
2. Read the recall trace and lead with entry point, output mode, and token use.
3. Explain each selected item using its reason and channel scores.
4. Summarize dropped counts and show the relevant top sample for each reason.
5. State vector fallback whenever vector status is degraded or disabled.

## Anti-patterns

WRONG: call a fresh search and claim it explains an earlier injection.

RIGHT: inspect the stored trace that produced the earlier injection.

## Checklist

- Selected and dropped reasons come from the trace.
- Scope mismatch is called out explicitly.
- Token estimator and final token count are reported.
- No raw query is reconstructed from its fingerprint.

## See also

- `recall`: retrieve relevant memory.
- `remember`: save an explicit durable memory.

## Troubleshooting

See ../_shared/TROUBLESHOOTING.md if the recall debug endpoint is unavailable.
