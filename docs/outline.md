# Outline Index — Hierarchical Section Index for Long Markdown Artifacts

## Why

Long markdown artifacts (`CLAUDE.md`, briefs, audits, AGENTS.md) routinely run 200–800 lines.
When an agent only needs one section, loading the full file wastes context tokens.

The outline index parses markdown headings into a tree, persists it in the KV store, and
exposes two retrieval primitives:

1. `memory_get_outline(artifact_id)` — returns the heading tree (cheap, ~200 tokens).
2. `memory_get_section(artifact_id, node_id)` — returns the raw text of one branch.

Inspired by [PageIndex](https://github.com/VectifyAI/PageIndex).

Typical gain on a 700-line CLAUDE.md when the agent only needs `## Workflow git`:
~95% fewer tokens read.

## Schema

KV scope: `mem:outlines`, key: `artifact_id` (absolute path or stable id).

```ts
interface Outline {
  artifact_id: string;
  title: string;             // first H1, or filename
  generated_at: string;      // ISO
  source_mtime: string;      // file mtime — used to detect staleness
  source_size: number;
  nodes: OutlineNode[];      // root-level headings
}

interface OutlineNode {
  node_id: string;           // positional, e.g. "1.2.3"
  title: string;
  level: number;             // 1..6
  line_start: number;        // 1-indexed
  line_end: number;          // inclusive, covers heading + body + descendants
  summary?: string;          // reserved, currently unset
  children: OutlineNode[];
}
```

The parser:

- Reads ATX headings (`#` … `######`).
- Skips lines inside fenced code blocks (` ``` ` and `~~~`).
- Computes `line_end` as the line preceding the next heading of equal or shallower level
  (or last line of the file).
- Numbering is positional and deterministic — sibling H2s under H1 → `1.1`, `1.2`, etc.

## Tools (MCP)

### `memory_build_outline`

```json
{ "path": "/Users/me/proj/CLAUDE.md" }
```

Returns `{ success, artifact_id, title, nodeCount, rootCount }`. Reads file, parses,
persists outline. Idempotent — overwrites the previous outline for the same `artifact_id`.

### `memory_get_outline`

```json
{ "artifact_id": "/Users/me/proj/CLAUDE.md" }
```

Returns the full `Outline` from KV, or `{ success: false, error: "outline not built…" }`.
This is the call you make first — agents pick a `node_id` from the tree.

### `memory_get_section`

```json
{ "artifact_id": "/Users/me/proj/CLAUDE.md", "node_id": "1.2.3" }
```

Returns `{ success, node, text, line_count }`. Reads the source file again (cheap), checks
mtime/size against the stored outline, and slices `lines[line_start..line_end]`.

If the file has changed since build → `{ success: false, stale: true, error: "outline stale, rebuild needed" }`.
The agent should call `memory_build_outline` again.

## REST endpoints

```
POST /agentmemory/outline/build      { path, artifact_id? }
GET  /agentmemory/outline?artifact_id=<id>
POST /agentmemory/outline/section    { artifact_id, node_id }
```

## Auto-regeneration hook

`src/hooks/outline-regen.ts` is a standalone PostToolUse hook. It:

1. Reads the tool name + tool input from stdin.
2. If the tool is `Write`, `Edit`, or `MultiEdit` and `tool_input.file_path` matches a tracked
   pattern (default: `CLAUDE.md`, `MEMORY.md`, `AGENTS.md`, or anything in
   `~/.config/agentmemory/outline-tracked.txt`), POSTs `/agentmemory/outline/build`.
3. Best-effort, 2-second timeout, non-blocking.

To opt in, add it to your Claude Code hook config. Mika: not enabled by default — wire
it in only on projects where the canvas/long-doc workflow benefits.

## Backfill

```bash
npx tsx scripts/outline-backfill.ts
```

Walks `~/CaptainAgent`, `~/.claude/projects`, and `~/*` (depth-limited, skipping
`node_modules`/`.git`/`dist`), finds every `CLAUDE.md`/`MEMORY.md`/`AGENTS.md`, and
posts each path to `/agentmemory/outline/build`. Prints `built: N / failed: M`.

## Limitations

- ATX headings only — no Setext (`====` / `----`) underlines.
- Markdown only. PDFs / docx / notebook cells are out of scope.
- No semantic summaries on nodes (`summary` field reserved for future).
- Staleness detection uses `mtime + size` — sub-second edits with identical size could be
  missed. Fine for human-edited docs.
- `artifact_id` defaults to the absolute path; if you move the file, build again with the
  new path (the old key stays in KV until manually purged).
- Hook only fires for `Write`/`Edit`/`MultiEdit` agent tools. Out-of-band edits (vim, IDE
  save) don't trigger regen — rely on the staleness check or rerun the backfill.
