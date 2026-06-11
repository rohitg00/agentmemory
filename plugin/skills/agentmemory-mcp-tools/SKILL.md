---
name: agentmemory-mcp-tools
description: Map of every agentmemory MCP tool, what each does, and its parameters. Use when choosing which memory tool to call, when a tool name or argument is unclear, or when answering what agentmemory can do via MCP.
user-invocable: false
---

agentmemory exposes its full capability set as MCP tools. This skill is the index: it tells you which tool to reach for and where to find exact parameters.

## Quick start

Save then recall:

1. `memory_save` with `content` (the insight), `concepts` (comma-separated keywords), `files` (comma-separated paths).
2. `memory_smart_search` with `query` and `limit` to retrieve it later. This runs hybrid BM25 plus vector plus graph-expanded search.

## Tool families

- Capture: `memory_save`, `memory_observe` flows, `memory_compress_file`.
- Retrieve: `memory_smart_search`, `memory_recall`, `memory_file_history`, `memory_timeline`, `memory_vision_search`.
- Sessions and commits: `memory_sessions`, `memory_commits`, `memory_commit_lookup`.
- Knowledge and graph: `memory_lesson_save`, `memory_lesson_recall`, `memory_graph_query`, `memory_relations`, `memory_patterns`, `memory_crystallize`.
- Structured slots: `memory_slot_create`, `memory_slot_append`, `memory_slot_get`, `memory_slot_list`, `memory_slot_replace`, `memory_slot_delete`.
- Governance and health: `memory_governance_delete`, `memory_audit`, `memory_verify`, `memory_heal`, `memory_diagnose`.

## Workflow

1. Pick the narrowest tool for the task. Prefer `memory_smart_search` for open recall, `memory_recall` when you already have a focused query, `memory_sessions` for session listings.
2. Look up exact parameter names and which are required in REFERENCE.md before calling.
3. Pass only documented fields. REST handlers whitelist fields and drop unknown ones.

## See also

- agentmemory-rest-api for the HTTP equivalents.
- agentmemory-config for tool-visibility and feature flags.
- The user-invocable action skills (remember, recall, recap, handoff, forget) wrap the most common tools.

## Reference

Full tool table with parameters and the core-set marking lives in REFERENCE.md, generated from source so it never drifts.
