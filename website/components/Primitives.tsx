import styles from "./Primitives.module.css";

const CARDS = [
  {
    glyph: "01",
    title: "Hooks",
    text:
      "12 auto-capture hooks piped into every coding agent. Every tool call, every prompt, every stop becomes a compressed observation, stamped with its origin and agent.",
  },
  {
    glyph: "02",
    title: "Recall",
    text:
      "Hybrid retrieval on the primary recall path: BM25, vector, and knowledge graph scores ranked together, reranked on device. Superseded versions stay out of results.",
  },
  {
    glyph: "03",
    title: "Consolidate",
    text:
      "With an LLM provider key, consolidation runs on session stop: raw observations compress into semantic memories, duplicates merge, stale rows decay, audit rows record it all.",
  },
];

export function Primitives() {
  return (
    <section className={styles.wrap} id="stack" aria-labelledby="prim-title">
      <header className="section-head">
        <span className="section-eyebrow">The stack</span>
        <h2 id="prim-title" className="section-title">
          Three layers.
          <br />
          No framework tax.
        </h2>
        <p className="section-lede">
          Built on the iii engine: every memory operation is a worker, a
          function, or a trigger. No external databases, queues, or vector
          stores. The entire runtime is one process.
        </p>
      </header>
      <div className={styles.grid}>
        {CARDS.map((c) => (
          <article key={c.glyph} className={styles.card}>
            <div className={styles.glyph}>{c.glyph}</div>
            <h3 className={styles.title}>{c.title}</h3>
            <p className={styles.text}>{c.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
