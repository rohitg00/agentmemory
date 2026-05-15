import styles from "./FeaturedIn.module.css";

interface Feature {
  name: string;
  sub: string;
  href: string;
}

const ITEMS: Feature[] = [
  {
    name: "AlphaSignal",
    sub: "180K technical subscribers",
    href: "https://alphasignalai.substack.com/p/how-agentmemory-works-and-how-to",
  },
  {
    name: "Agentic AI Foundation",
    sub: "Linux Foundation backed",
    href: "https://aaif.io/",
  },
  {
    name: "Trendshift",
    sub: "Position #19 · NEW 2026",
    href: "https://trendshift.io/repositories/25123",
  },
];

export function FeaturedIn() {
  return (
    <section className={styles.wrap} aria-labelledby="featured-in-title">
      <div className={styles.inner}>
        <div id="featured-in-title" className={styles.eyebrow}>
          AS FEATURED IN
        </div>
        <div className={styles.row}>
          {ITEMS.map((it) => (
            <a
              key={it.name}
              className={styles.cell}
              href={it.href}
              target="_blank"
              rel="noopener"
            >
              <div className={styles.cellInner}>
                <span className={styles.arrow} aria-hidden>
                  ↗
                </span>
                <span className={styles.name}>{it.name}</span>
                <span className={styles.sub}>{it.sub}</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
