import styles from "./Features.module.css";

interface Props {
  hooks: number;
  mcpTools: number;
  restEndpoints: number;
}

export function Features({ hooks, mcpTools, restEndpoints }: Props) {
  const FEATURES = [
    {
      k: `${hooks}`,
      unit: "AUTO-HOOKS",
      title: "CAPTURE EVERYTHING",
      text:
        "Every PreToolUse, PostToolUse, SessionStart, Stop, and the rest fire into the memory pipeline without a line of glue code. Install the plugin, done.",
    },
    {
      k: `${mcpTools}`,
      unit: "MCP TOOLS",
      title: "NATIVE MCP SURFACE",
      text:
        "memory_save, memory_recall, memory_smart_search, memory_sessions, governance, audit, export — full surface behind a single MCP server.",
    },
    {
      k: `${restEndpoints}`,
      unit: "REST ENDPOINTS",
      title: "HTTP FIRST",
      text:
        "Every MCP tool has a REST twin under /agentmemory/*. Curl it. Fetch it from the browser. Proxy it from your own agent.",
    },
    {
      k: "BM25",
      unit: "+ VECTOR + GRAPH",
      title: "TRIPLE-STREAM RECALL",
      text:
        "Hybrid retrieval pipes lexical, semantic, and relational scores through an on-device reranker. 95.2% R@5 on LongMemEval-S.",
    },
    {
      k: "AUTO",
      unit: "CONSOLIDATION",
      title: "RAW → SEMANTIC",
      text:
        "Hourly sweep compresses observations into semantic memories, merges duplicates, decays stale rows with retention scoring, and emits a batched audit row.",
    },
    {
      k: "∞",
      unit: "REPLAY",
      title: "JSONL SESSION IMPORT",
      text:
        "Point agentmemory at a Claude Code JSONL transcript and it rehydrates the full session — observations, tool uses, timeline — into the store.",
    },
    {
      k: "GRAPH",
      unit: "EXTRACTION",
      title: "KNOWLEDGE GRAPH",
      text:
        "Entities and relations extract after Stop / SessionEnd. /session/end fans out the stopped lifecycle, and the viewer can backfill with /agentmemory/graph/build.",
    },
    {
      k: "MESH",
      unit: "FEDERATION",
      title: "PEER-TO-PEER SYNC",
      text:
        "Register another agentmemory node, push / pull memories over authenticated HTTPS. Bearer-token required; no silent syncs.",
    },
    {
      k: "MD",
      unit: "OBSIDIAN EXPORT",
      title: "YOUR NOTES, HYDRATED",
      text:
        "Mirror memories to a sandboxed vault directory. Frontmatter-tagged markdown, ready for Obsidian's graph view.",
    },
    {
      k: "5",
      unit: "LLM PROVIDERS",
      title: "BYO MODEL",
      text:
        "Claude subscription (default, zero config), Anthropic API, Gemini, MiniMax, OpenRouter. Detected from env.",
    },
    {
      k: "OTEL",
      unit: "OBSERVABILITY",
      title: "TRACES + LOGS",
      text:
        "iii-observability worker on by default. Exporter: memory for local, OTLP for Jaeger / Honeycomb / Tempo. Every operation produces a span.",
    },
    {
      k: "0",
      unit: "EXTERNAL DBs",
      title: "ONE PROCESS",
      text:
        "Runs as a single Node process. No Redis, Kafka, Postgres, Qdrant, Neo4j. State lives on disk as JSON. That's the whole stack.",
    },
  ];

  return (
    <section className={styles.wrap} id="features" aria-labelledby="feat-title">
      <header className="section-head">
        <span className="section-eyebrow">WHAT'S INSIDE</span>
        <h2 id="feat-title" className="section-title">
          TWELVE THINGS YOU DID NOT WANT TO BUILD.
        </h2>
        <p className="section-lede">
          AGENTMEMORY IS NOT A LIBRARY OR A VECTOR STORE. IT'S A COMPLETE MEMORY
          RUNTIME — CAPTURE, RECALL, CONSOLIDATE, OBSERVE, FEDERATE.
        </p>
      </header>
      <ul className={styles.grid}>
        {FEATURES.map((f) => (
          <li key={f.title} className={styles.tile}>
            <div className={styles.kPill}>
              <span className={styles.k}>{f.k}</span>
              <span className={styles.unit}>{f.unit}</span>
            </div>
            <h3 className={styles.tileTitle}>{f.title}</h3>
            <p className={styles.tileText}>{f.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
