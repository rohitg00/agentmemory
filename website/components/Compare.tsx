import styles from "./Compare.module.css";
import meta from "../lib/generated-meta.json";

const ROWS = [
  ["RETRIEVAL", "95.2% (LongMemEval-S)", "68.5% (LoCoMo)", "83.2% (LoCoMo)", "63.8% (LongMemEval)"],
  ["EXTERNAL DEPS", "0", "Qdrant / pgvector", "Postgres + vector", "Neo4j"],
  ["REST ENDPOINTS", String(meta.restEndpoints), "—", "—", "—"],
  ["MCP TOOLS", String(meta.mcpTools), "—", "—", "—"],
  ["AUTO-CAPTURE HOOKS", String(meta.hooks), "Manual add()", "Agent self-edits", "—"],
  ["NATIVE AGENT PLUGINS", "6", "—", "—", "—"],
  ["OPEN SOURCE", "Yes (Apache-2.0)", "Yes", "Yes", "Yes"],
];

export function Compare() {
  return (
    <section className={styles.compare} id="compare" aria-labelledby="cmp-title">
      <header className="section-head">
        <span className="section-eyebrow">VS.</span>
        <h2 id="cmp-title" className="section-title">
          Vs. the field.
        </h2>
        <p className="section-lede">
          Only the agentmemory number is ours, measured on LongMemEval-S and
          reproducible from the repo. Competitor figures are their own published
          claims on their own benchmarks — different datasets, shown for
          ballpark. Ship what you want; we just picked the one with receipts.
        </p>
      </header>
      <div className={styles.table} role="table" aria-label="Comparison" tabIndex={0}>
        <div className={`${styles.row} ${styles.head}`} role="row">
          <span role="columnheader" />
          <span role="columnheader" className={styles.mine}>
            AGENTMEMORY
          </span>
          <span role="columnheader">MEM0</span>
          <span role="columnheader">LETTA</span>
          <span role="columnheader">ZEP / GRAPHITI</span>
        </div>
        {ROWS.map((r) => (
          <div key={r[0]} className={styles.row} role="row">
            <span role="rowheader">{r[0]}</span>
            <span className={styles.mine}>{r[1]}</span>
            <span>{r[2]}</span>
            <span>{r[3]}</span>
            <span>{r[4]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
