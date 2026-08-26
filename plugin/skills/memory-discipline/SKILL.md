---
name: memory-discipline
description: The session loop that makes agentmemory pay off, recall before starting work, save at decision points, learn from corrections. Use when starting a nontrivial task, after settling a decision or debugging a gotcha, or whenever deciding if something belongs in memory.
user-invocable: false
---

Memory only pays off when reads happen before the work and writes happen at decision points. This loop is the skill; every tool call in it is mechanical.

## Quick start

```json
memory_smart_search { "query": "auth refresh flow", "project": "myrepo", "limit": 5 }
```

at task start, then at each settled decision:

```json
memory_save { "content": "Chose cursor pagination over offset; offset scans broke past 100k rows in db/list.ts.", "concepts": "cursor-pagination, offset-scan-limit", "files": "src/db/list.ts" }
```

## Why

Hooks capture what happened automatically. What they cannot capture is judgment: which fact mattered, which decision was settled, which correction should change future behavior. That judgment applied at the right moments is this discipline.

## Workflow

1. Task start, before reading code for any nontrivial task: `memory_smart_search` with the task topic and the project name. Spend the first tool call here; a hit saves rediscovery, a miss costs one call.
2. Mid-task, the moment a decision settles or a gotcha resolves: `memory_save` with the decision AND the reason, 2-5 specific concepts, real file paths. Save at the moment of resolution; end-of-session batch saves lose the reasons.
3. On user correction of your approach: save a lesson instead of a memory (the `lesson` skill). Lessons carry confidence and resurface before similar work; memories carry facts.
4. Before repeating a task type you have been corrected on: `memory_lesson_recall` with the task type as query.
5. Session end: stop. Hooks summarize and consolidate; a manual recap save duplicates them.

## What qualifies

Save: settled decisions with reasons, non-obvious constraints discovered by debugging, environment facts not derivable from the repo. Skip: anything readable from the code, transient state, secrets, and step-by-step narration (hooks already captured it).

## Anti-patterns

WRONG: finish implementing, then search memory to double-check, and batch-save a summary of everything done.

RIGHT: search first, save each decision as it settles, let hooks own the summary.

## Checklist

- First tool call on a nontrivial task was a project-scoped search.
- Every save carries the reason, not just the conclusion.
- Corrections became lessons, not memories.
- Nothing saved that the repo or hooks already record.

## See also

- `recall`, `remember`: the user-invoked forms of the read and write sides.
- `lesson`: the correction loop this discipline hands off to.

## Troubleshooting

See ../_shared/TROUBLESHOOTING.md if `memory_smart_search` or `memory_save` is not available.
