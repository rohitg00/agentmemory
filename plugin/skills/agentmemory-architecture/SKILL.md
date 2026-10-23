---
name: agentmemory-architecture
description: How agentmemory is built, the iii engine primitives it runs on, its storage model, ports, and the viewer. Use when reasoning about how memory is stored or retrieved end to end, when extending the system, or when answering how agentmemory works under the hood.
user-invocable: false
---

agentmemory is a memory server for coding agents. It runs locally, captures observations, indexes them for hybrid retrieval, and serves them back over REST and MCP. It is built on the iii engine.

## iii primitives

Everything is a function, a trigger, or worker state on the iii engine. There is no separate plugin system; the worker registers functions (`mem::*`) and HTTP triggers (`api::*`) and the engine routes calls. agentmemory does not bypass iii; new capability is a new function plus a trigger.

## Retrieval model

Recall combines BM25 keyword search with configured vector similarity and graph expansion. A clean installation without an embedding provider uses BM25 without an API key. Set `EMBEDDING_PROVIDER=local` to enable on-device embeddings, which may download a model, or configure a remote provider. LLM compression and summaries require a configured provider and their relevant options.

## Storage and lifecycle

Memories carry content, concepts, files, importance, and timestamps, grouped into sessions and optionally linked to commits. A lifecycle of capture, compress, consolidate, and forget keeps the store useful over time rather than letting it grow unbounded.

## Ports

REST defaults to port `3111`, the viewer to `3113`, and the internal engine WebSocket to `49134`. Use `--port <N>` or `--instance <N>` to select another local runtime.

## Viewer

A real-time web viewer at `http://localhost:3113` shows memory building as sessions run. Useful for demos and for confirming capture is working.

## See also

- agentmemory-mcp-tools and agentmemory-rest-api for the surfaces.
- agentmemory-hooks for automatic capture.
- agentmemory-config for ports and feature flags.
