# Python usage via `iii-sdk`

agentmemory registers its core operations as iii functions (`mem::remember`,
`mem::observe`, `mem::context`, `mem::smart-search`, `mem::forget`). Any
language with an iii SDK can call them directly over the WebSocket transport
on `ws://localhost:49134` — no separate REST client needed.

This example uses the official Python SDK.

## Install

```bash
pip install iii-sdk
```

## Quickstart

Start the agentmemory daemon (defaults to `ws://localhost:49134`, REST on
`:3111`):

```bash
npx -y @agentmemory/agentmemory
```

Then from Python:

```python
from iii import register_worker

iii = register_worker("ws://localhost:49134")
iii.connect()

iii.trigger({
    "function_id": "mem::remember",
    "payload": {
        "project": "demo",
        "title": "auth-stack",
        "content": "Service uses HMAC bearer tokens; refresh every 24h.",
        "concepts": ["auth", "hmac", "refresh"],
    },
})

hits = iii.trigger({
    "function_id": "mem::smart-search",
    "payload": {"project": "demo", "query": "how do tokens refresh", "limit": 5},
})
print(hits)
```

## Functions exposed

| Function id | Purpose | Required payload |
|---|---|---|
| `mem::remember` | Save a memory | `project`, `title`, `content` |
| `mem::observe` | Hook-driven observation ingest | `hookType`, `sessionId`, `project`, `cwd`, `timestamp` |
| `mem::context` | Render context for a session under a token budget | `sessionId`, `project`, optional `budget` |
| `mem::smart-search` | Hybrid BM25 + vector + concept recall | `project`, `query`, optional `limit` |
| `mem::forget` | Delete a memory by id | `id` |

The HTTP-trigger wrappers under `api::*` (callable via REST on `:3111`) exist
for the same operations if you need to reach the daemon from a host without an
iii runtime. Inside the iii ecosystem, calling the `mem::*` functions directly
is lower latency.

## Files

- `quickstart.py` — minimal save-then-search loop.
- `observe_and_recall.py` — observation ingest + context rendering at a token
  budget.

Both scripts assume the daemon is already running.
