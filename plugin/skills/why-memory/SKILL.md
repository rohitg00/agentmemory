---
name: why-memory
description: Explain a memory's recent recall history and scope decisions from agentmemory traces. Use when the user asks why a specific memory was or was not recalled.
argument-hint: "<memory-id>"
user-invocable: true
---

## Quick start

Find the memory id, then query recall debug with `itemId` set to that id.

## Why

Memory provenance and recall history answer different questions. Inspect both the
memory record and its traces before drawing a conclusion.

## Workflow

1. Require a memory id; do not guess one from title text.
2. Read the memory record and recall stats.
3. Query recall debug filtered by that item id.
4. Separate selected traces from scope mismatch, stale, duplicate, and budget drops.
5. Show source sessions and observations when available.

## Anti-patterns

WRONG: describe a memory as global because it was saved manually.

RIGHT: report its explicit scope and origin from the memory record.

## Checklist

- Scope and origin are shown.
- Recent selected and dropped evidence is separated.
- Unknown scope is never described as global.

## See also

- `recall-debug`: inspect one recall invocation.
- `recall`: retrieve context for a query.

## Troubleshooting

See ../_shared/TROUBLESHOOTING.md if memory lookup is unavailable.
