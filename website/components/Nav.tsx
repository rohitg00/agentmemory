import Image from "next/image";
import { fetchRepoStats } from "@/lib/github";
import { formatCompact } from "@/lib/format";
import { MobileNavToggle } from "./MobileNavToggle";
import styles from "./Nav.module.css";

const SECTIONS = [
  { href: "#stack", label: "STACK" },
  { href: "#features", label: "FEATURES" },
  { href: "#command-center", label: "CONTROL" },
  { href: "#live", label: "DEMO" },
  { href: "#compare", label: "VS" },
  { href: "#install", label: "INSTALL" },
  { href: "/docs", label: "DOCS" },
];

export async function Nav() {
  const stats = await fetchRepoStats();
  return (
    <header className={styles.nav}>
      <a href="#top" className={styles.brand} aria-label="agentmemory home">
        <Image
          src="/icon.svg"
          width={36}
          height={36}
          alt=""
          aria-hidden
          className={styles.brandIcon}
        />
        <span className={styles.brandWord}>AGENTMEMORY</span>
      </a>

      <nav className={styles.links} aria-label="Sections">
        {SECTIONS.map((s) => (
          <a key={s.href} href={s.href} className={styles.link}>
            {s.label}
          </a>
        ))}
      </nav>

      <div className={styles.right}>
        <a
          className={styles.gh}
          href="https://github.com/rohitg00/agentmemory"
          target="_blank"
          rel="noopener"
          aria-label={`agentmemory on GitHub — ${stats.stars} stars`}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path
              fill="currentColor"
              d="M12 .5C5.648.5.5 5.648.5 12c0 5.087 3.292 9.397 7.862 10.921.575.108.782-.25.782-.555v-1.96c-3.197.695-3.873-1.544-3.873-1.544-.523-1.327-1.277-1.68-1.277-1.68-1.044-.713.08-.699.08-.699 1.154.08 1.76 1.184 1.76 1.184 1.025 1.757 2.688 1.25 3.344.956.104-.742.4-1.25.728-1.537-2.552-.29-5.235-1.276-5.235-5.675 0-1.254.448-2.279 1.182-3.083-.118-.291-.513-1.461.112-3.046 0 0 .965-.31 3.162 1.178a10.964 10.964 0 0 1 2.878-.387c.977.004 1.96.131 2.878.387 2.195-1.487 3.16-1.178 3.16-1.178.626 1.585.231 2.755.113 3.046.736.804 1.18 1.829 1.18 3.083 0 4.41-2.686 5.381-5.246 5.665.411.354.778 1.053.778 2.122v3.146c0 .307.205.668.787.555C20.213 21.394 23.5 17.086 23.5 12 23.5 5.648 18.352.5 12 .5Z"
            />
          </svg>
          <span className={styles.ghLabel}>GITHUB</span>
          <span className={styles.ghDivider} aria-hidden />
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
            <path
              d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279L12 19.245l-7.416 4.168 1.48-8.279L0 9.306l8.332-1.151z"
              fill="#FFC000"
            />
          </svg>
          <span className={styles.ghCount}>{formatCompact(stats.stars)}</span>
        </a>
        <a href="#install" className={`${styles.cta} btn btn--accent`}>
          INSTALL
        </a>
        <MobileNavToggle sections={SECTIONS} stars={stats.stars} />
      </div>
    </header>
  );
}
