import styles from "./Compare.module.css";

const ROWS = [
  ["RETRIEVAL R@5", "95.2%", "81.4%", "73.8%", "78.1%"],
  ["EXTERNAL DEPS", "0", "2 (Qdrant, Neo4j)", "1 (Postgres)", "1 (Neo4j)"],
  ["REST ENDPOINTS", "121", "—", "—", "—"],
  ["MCP TOOLS", "51", "12", "18", "9"],
  ["AUTO-HOOKS", "12", "0", "0", "0"],
  ["NATIVE PLUGINS", "6", "—", "—", "—"],
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
          Numbers straight from the LongMemEval-S benchmark and each
          project&apos;s own docs. Ship what you want — we just picked the one
          with receipts.
        </p>
      </header>
      <div className={styles.table} role="table" aria-label="Comparison">
        <div className={`${styles.row} ${styles.head}`} role="row">
          <span role="columnheader" />
          <span role="columnheader" className={styles.mine}>
            AGENTMEMORY
          </span>
          <span role="columnheader">MEM0</span>
          <span role="columnheader">LETTA</span>
          <span role="columnheader">COGNEE</span>
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
