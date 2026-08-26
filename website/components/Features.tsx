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
        "Every session start, prompt, tool call, and stop fires into the memory pipeline with no glue code. Install the plugin and capture begins.",
    },
    {
      k: `${mcpTools}`,
      unit: "MCP TOOLS",
      title: "Native MCP surface",
      text:
        "memory_save, memory_recall, memory_smart_search, memory_sessions, governance, audit, export: the full surface behind a single MCP server. Saving a near-duplicate returns a similarTo hint instead of a second copy.",
    },
    {
      k: `${restEndpoints}`,
      unit: "REST ENDPOINTS",
      title: "HTTP first",
      text:
        "Every MCP tool has a REST twin under /agentmemory/*. Curl it, fetch it from the browser, or proxy it from your own agent.",
    },
    {
      k: "BM25",
      unit: "+ VECTOR + GRAPH",
      title: "Hybrid recall",
      text:
        "The primary recall path ranks lexical, semantic, and graph scores together, reranked on device. Superseded versions stay out of results while their history stays queryable.",
    },
    {
      k: "5",
      unit: "ORIGIN CHANNELS",
      title: "Provenance built in",
      text:
        "Every record carries write-time provenance: user, agent, tool, import, or shared. Pass agentId through save and recall to scope memory per agent.",
    },
    {
      k: "AUTO",
      unit: "CONSOLIDATION",
      title: "Raw to semantic",
      text:
        "Activates with an LLM provider key. Consolidation runs on session stop: observations compress into semantic memories, duplicates merge, stale rows decay with retention scoring, and audit rows record the sweep.",
    },
    {
      k: "∞",
      unit: "REPLAY",
      title: "JSONL session import",
      text:
        "Point agentmemory at a Claude Code JSONL transcript and it rehydrates the session, indexes it for search, and derives crystals and lessons from what it finds.",
    },
    {
      k: "GRAPH",
      unit: "EXTRACTION",
      title: "Knowledge graph",
      text:
        "Entities and relations extract from observations when an LLM provider key is set and graph extraction is enabled. Query with /agentmemory/graph. Visualize in the viewer. Temporal edges supported.",
    },
    {
      k: "IDX",
      unit: "LESSON RECALL",
      title: "Lessons that resurface",
      text:
        "Save a lesson once, recall it by relevance later. Lessons live in a dedicated BM25 index with confidence and recency reranking, with save, recall, and delete over MCP and REST.",
    },
    {
      k: "MESH",
      unit: "FEDERATION",
      title: "Peer-to-peer sync",
      text:
        "Register another agentmemory node and push or pull memories over authenticated HTTPS. A bearer token is required; no silent syncs.",
    },
    {
      k: "MD",
      unit: "OBSIDIAN EXPORT",
      title: "Your notes, hydrated",
      text:
        "Mirror memories to a sandboxed vault directory as frontmatter-tagged markdown, ready for Obsidian's graph view.",
    },
    {
      k: "0",
      unit: "EXTERNAL DBs",
      title: "One process",
      text:
        "Runs as a single Node process with zero external services. State lives on disk as JSON. agentmemory stop flushes indexes before exit, in Docker mode too.",
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
          agentmemory is not a library or a vector store. It is a complete
          memory runtime: capture, recall, consolidate, observe, federate.
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
