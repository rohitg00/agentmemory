# 05 — Bounded Working Context Assembly

**What to build:** An intelligent context enrichment pipeline that constructs a bounded three-tier Working Context (latest Session Checkpoint + top semantic memories/ADRs + sliding tail of last 25 episodic observations) for model prompts, guaranteeing sharp reasoning without context window bloat.

**Blocked by:** 02 — Dual-Lookup Fallback for Memory Recall, 04 — Asynchronous Background Micro-Compaction Worker

**Status:** ready-for-agent

- [ ] Update `/agentmemory/enrich` and prompt transformation hooks to construct the three-tier context structure.
- [ ] Inject the latest synthesized `Session Checkpoint` representing macro milestones and accomplishments.
- [ ] Perform semantic retrieval to select the top 3 relevant ADRs, crystals, and lessons matching the prompt.
- [ ] Append a trailing sliding window containing the last 25 raw `Episodic Observations` for low-latency operational awareness.
- [ ] Add unit tests verifying prompt payload size boundaries and structure across short and long simulated sessions.
