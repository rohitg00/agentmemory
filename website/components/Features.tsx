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
      title: "Capture everything",
      text:
        "Every PreToolUse, PostToolUse, SessionStart, Stop, and the rest fire into the memory pipeline without a line of glue code. Install the plugin, done.",
    },
    {
      k: `${mcpTools}`,
      unit: "MCP TOOLS",
      title: "Native MCP surface",
      text:
        "memory_save, memory_recall, memory_smart_search, memory_sessions, governance, audit, export — full surface behind a single MCP server.",
    },
    {
      k: `${restEndpoints}`,
      unit: "REST ENDPOINTS",
      title: "HTTP first",
      text:
        "Every MCP tool has a REST twin under /agentmemory/*. Curl it. Fetch it from the browser. Proxy it from your own agent.",
    },
    {
      k: "BM25",
      unit: "+ VECTOR + GRAPH",
      title: "Triple-stream recall",
      text:
        "Hybrid retrieval pipes lexical, semantic, and relational scores through an on-device reranker. 95.2% R@5 on LongMemEval-S.",
    },
    {
      k: "AUTO",
      unit: "CONSOLIDATION",
      title: "Raw → semantic",
      text:
        "Hourly sweep compresses observations into semantic memories, merges duplicates, decays stale rows with retention scoring, and emits a batched audit row.",
    },
    {
      k: "∞",
      unit: "REPLAY",
      title: "JSONL session import",
      text:
        "Point agentmemory at a Claude Code JSONL transcript and it rehydrates the full session — observations, tool uses, timeline — into the store.",
    },
    {
      k: "GRAPH",
      unit: "EXTRACTION",
      title: "Knowledge graph",
      text:
        "Entities and relations extracted on compress. Query with /agentmemory/graph. Visualize in the viewer. Temporal edges supported.",
    },
    {
      k: "MESH",
      unit: "FEDERATION",
      title: "Peer-to-peer sync",
      text:
        "Register another agentmemory node, push / pull memories over authenticated HTTPS. Bearer-token required; no silent syncs.",
    },
    {
      k: "MD",
      unit: "OBSIDIAN EXPORT",
      title: "Your notes, hydrated",
      text:
        "Mirror memories to a sandboxed vault directory. Frontmatter-tagged markdown, ready for Obsidian's graph view.",
    },
    {
      k: "5",
      unit: "LLM PROVIDERS",
      title: "BYO model",
      text:
        "Claude subscription (default, zero config), Anthropic API, Gemini, MiniMax, OpenRouter. Detected from env.",
    },
    {
      k: "OTEL",
      unit: "OBSERVABILITY",
      title: "Traces + logs",
      text:
        "iii-observability worker on by default. Exporter: memory for local, OTLP for Jaeger / Honeycomb / Tempo. Every operation produces a span.",
    },
    {
      k: "0",
      unit: "EXTERNAL DBs",
      title: "One process",
      text:
        "Runs as a single Node process. No Redis, Kafka, Postgres, Qdrant, Neo4j. State lives on disk as JSON. That's the whole stack.",
    },
  ];

  return (
    <section className={styles.wrap} id="features" aria-labelledby="feat-title">
      <header className="section-head">
        <span className="section-eyebrow">What's inside</span>
        <h2 id="feat-title" className="section-title">
          Twelve things you did not want to build.
        </h2>
        <p className="section-lede">
          agentmemory is not a library or a vector store. It's a complete memory
          runtime — capture, recall, consolidate, observe, federate.
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
