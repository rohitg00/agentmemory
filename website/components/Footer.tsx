import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.foot}>
      <div className={styles.row}>
        <a href="#top" className={styles.mark}>
          agentmemory
        </a>
        <nav className={styles.links} aria-label="Footer">
          <a
            href="https://github.com/rohitg00/agentmemory"
            target="_blank"
            rel="noopener"
          >
            Source
          </a>
          <a
            href="https://github.com/rohitg00/agentmemory/blob/main/CHANGELOG.md"
            target="_blank"
            rel="noopener"
          >
            Changelog
          </a>
          <a href="https://iii.dev" target="_blank" rel="noopener">
            Runs on iii
          </a>
          <a
            href="https://github.com/rohitg00/agentmemory/blob/main/LICENSE"
            target="_blank"
            rel="noopener"
          >
            Apache-2.0
          </a>
        </nav>
      </div>
      <div className={styles.fine}>© 2026 agentmemory · Built in the open</div>
    </footer>
  );
}
