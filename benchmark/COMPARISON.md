# Choosing a memory system

Checked against the linked primary sources on 2026-10-28. Products evolve; deployment, model usage and commercial plans depend on the selected configuration.

| Project | Main use | Deployment and integration |
|---|---|---|
| **[AgentMemory](../README.md)** | Shared project memory for existing coding agents | Apache-2.0 local service; automatic capture on supported integrations, MCP and REST. BM25 works without a model key; embeddings and LLM processing are optional. The CLI installs its runtime. |
| **[Mem0](https://docs.mem0.ai/introduction)** | Memory APIs for applications and coding agents | Hosted platform or open-source library/server; SDKs, MCP and coding-agent plugins. Capture depends on the integration. [Platform and OSS differ](https://docs.mem0.ai/platform/platform-vs-oss), including graph availability. |
| **[Supermemory](https://supermemory.ai/docs/self-hosting/overview)** | Memory and document context for applications and agents | Hosted API or local server binary, plus coding-agent plugins. The local server has embedded storage and local embeddings; its codebase is separate and non-public. Local and hosted capabilities differ. |
| **[Zep / Graphiti](https://github.com/getzep/graphiti)** | Enterprise context and temporal knowledge graphs | Zep offers a managed or BYOC platform. Apache-2.0 Graphiti is a separate self-hosted graph framework with database and model configuration. |
| **[Letta](https://docs.letta.com/)** | Stateful agents with managed memory | Agent harness, CLI and SDK with MemFS/shared memory; managed cloud or self-hosted runtime. It supplies the agent runtime as well as memory. |
| **[Cognee](https://github.com/topoteretes/cognee)** | Searchable knowledge from documents, code and conversations | Open-source local library/server or Cognee Cloud, with plugins and MCP. Local extraction and embedding models support a keyless path. |
| **[claude-mem](https://github.com/thedotmack/claude-mem)** | Capture and summarize coding sessions | Apache-2.0 project with multiple agent integrations. Model-backed summaries can use its hosted observer or a configured provider; installation and provider choices affect data flow and cost. |

AgentMemory fits developers who want one local memory service shared by their existing tools, with inspectable observations, lessons, actions, source expansion and a live viewer. An application-facing API, managed enterprise platform, document graph or complete stateful-agent runtime may suit a different workload better.

## Compare measurements on the same terms

The [current retrieval report](../docs/benchmarks/2026-10-28-retrieval-evaluation.md) measures the BM25 component and a grep baseline over identical supplied sessions. It includes strict recall-all@5, partial recall, any-hit, coverage and failures. It does not rank the products above.

A useful comparison must hold the dataset revision, ingestion path, retrieved unit, cutoff, model, context budget, reader and judge constant. Retrieval recall, answer accuracy, task completion and token use measure different things. Historical scores and unrelated datasets should not share a leaderboard.

## Costs and data flow

AgentMemory has no license fee or hosted subscription. You operate its local runtime; optional hosted models charge for their usage. Installation, updates and first-use local model downloads need network access. Memory text stays local with keyless search or local models; configured remote services receive the text they process.

For commercial services, use their current plans instead of a copied monthly price: [Mem0](https://mem0.ai/pricing), [Supermemory](https://supermemory.ai/pricing), [Zep](https://www.getzep.com/pricing/), [Letta](https://docs.letta.com/), [Cognee](https://docs.cognee.ai/cognee-cloud/overview), and [claude-mem](https://github.com/thedotmack/claude-mem). Check the chosen deployment's provider, telemetry, retention and access controls before using private data.
