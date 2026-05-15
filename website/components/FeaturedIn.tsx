import Image from "next/image";
import styles from "./FeaturedIn.module.css";

interface Feature {
  name: string;
  sub: string;
  href: string;
  logo: string;
  logoAlt: string;
  // When the source has its own brand-mark image (e.g. Trendshift's
  // badge endpoint that bakes the repo's star count into the image),
  // render it full-width instead of the logo-left text-right layout.
  badge?: boolean;
}

const ITEMS: Feature[] = [
  {
    name: "AlphaSignal",
    sub: "180K technical subscribers",
    href: "https://alphasignalai.substack.com/p/how-agentmemory-works-and-how-to",
    logo: "https://avatars.githubusercontent.com/u/64016073?s=200&v=4",
    logoAlt: "AlphaSignal logo",
  },
  {
    name: "Agentic AI Foundation",
    sub: "Linux Foundation backed",
    href: "https://aaif.io/",
    logo: "/featured/aaif-logo.png",
    logoAlt: "Agentic AI Foundation logo",
    badge: true,
  },
  {
    name: "Trendshift",
    sub: "Position #19 · NEW 2026",
    href: "https://trendshift.io/repositories/25123",
    logo: "https://trendshift.io/api/badge/repositories/25123",
    logoAlt: "Trendshift badge for agentmemory",
    badge: true,
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
          {ITEMS.map((it) =>
            it.badge ? (
              <a
                key={it.name}
                className={`${styles.cell} ${styles.cellBadge}`}
                href={it.href}
                target="_blank"
                rel="noopener"
                aria-label={`${it.name} — ${it.sub}`}
              >
                <Image
                  src={it.logo}
                  alt={it.logoAlt}
                  width={250}
                  height={55}
                  unoptimized
                  className={
                    it.logo.startsWith("/featured/aaif")
                      ? `${styles.badgeImg} ${styles.invertLogo}`
                      : styles.badgeImg
                  }
                />
                <span className={styles.sub}>{it.sub}</span>
              </a>
            ) : (
              <a
                key={it.name}
                className={styles.cell}
                href={it.href}
                target="_blank"
                rel="noopener"
              >
                <Image
                  src={it.logo}
                  alt={it.logoAlt}
                  width={56}
                  height={56}
                  unoptimized
                  className={styles.logo}
                />
                <div className={styles.meta}>
                  <span className={styles.name}>{it.name}</span>
                  <span className={styles.sub}>{it.sub}</span>
                </div>
                <span className={styles.arrow} aria-hidden>
                  ↗
                </span>
              </a>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
