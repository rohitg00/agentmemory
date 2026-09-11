# 04 — Asynchronous Background Micro-Compaction Worker

**What to build:** An automatic, non-blocking background compaction worker that monitors session uncompacted observation watermarks and triggers LLM-powered summarization into intermediate Session Checkpoints, preventing unbounded memory growth.

**Blocked by:** 03 — Unbounded Observation Ingestion Pipeline

**Status:** ready-for-agent

- [ ] Implement dual-watermark monitoring: trigger when uncompacted observations >= 200, OR when conversational idle time >= 30 seconds with >= 50 uncompacted observations.
- [ ] Dispatch background compaction asynchronously via `mem::summarize` without blocking the primary agent conversation loop.
- [ ] Persist synthesized compaction output as a `Session Checkpoint` linked to the active session.
- [ ] Advance the uncompacted observation pointer upon successful checkpoint generation.
- [ ] Write tests validating watermark trigger conditions and asynchronous non-blocking execution.
