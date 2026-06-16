---
name: agentmemory-architecture
description: How agentmemory is built, the iii engine primitives it runs on, its storage model, ports, and the viewer. Use when reasoning about how memory is stored or retrieved end to end, when extending the system, or when answering how agentmemory works under the hood.
user-invocable: false
---

agentmemory is a memory server for coding agents. It runs locally, captures observations, indexes them for hybrid retrieval, and serves them back over REST and MCP. It is built on the iii engine.

## iii primitives

Everything is a function, a trigger, or worker state on the iii engine. There is no separate plugin system; the worker registers functions (`mem::*`) and HTTP triggers (`api::*`) and the engine routes calls. agentmemory does not bypass iii; new capability is a new function plus a trigger.

## Retrieval model

Recall combines BM25 keyword search, optional vector similarity, and graph expansion over linked concepts. The default install needs no API key and does not call a text embedding provider; vector search is explicit opt-in via `EMBEDDING_PROVIDER=local` for on-device embeddings or `EMBEDDING_PROVIDER=<remote>` plus that provider's key. An LLM provider only adds richer summaries and auto-injection, both opt-in.

## Storage and lifecycle

Memories carry content, concepts, files, importance, and timestamps, grouped into sessions and optionally linked to commits. A lifecycle of capture, compress, consolidate, and forget keeps the store useful over time rather than letting it grow unbounded.

## Ports

REST is the anchor at 3111. Streams = N+1 (3112), viewer = N+2 (3113), and the bundled native iii-engine v0.11.2 listens on its default WebSocket port 49134. `--instance N` shifts REST, streams, and viewer by N*100; it does not relocate the bundled native engine listen port.

## Viewer

A real-time web viewer at `http://localhost:3113` shows memory building as sessions run. Useful for demos and for confirming capture is working.

## See also

- agentmemory-mcp-tools and agentmemory-rest-api for the surfaces.
- agentmemory-hooks for automatic capture.
- agentmemory-config for ports and feature flags.
