import { MemoryGraph } from "./MemoryGraph";
import { GitHubStarButton } from "./GitHubStarButton";
import { HeroNpxCommand } from "./HeroNpxCommand";
import { getProjectMeta } from "@/lib/meta";
import { fetchRepoStats } from "@/lib/github";
import styles from "./Hero.module.css";

export async function Hero() {
  const meta = getProjectMeta();
  const stats = await fetchRepoStats();
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <MemoryGraph />
      <div className={styles.vignette} aria-hidden />
      <div className={styles.content}>
        <div className={styles.chip}>
          ZERO EXTERNAL DATABASES · v{meta.version}
        </div>
        <h1 className={styles.title} id="hero-title">
          <span className={styles.word}>agent</span>
          <span className={`${styles.word} ${styles.accent}`}>memory</span>
        </h1>
        <p className={styles.lede}>
          Give your coding agent a memory that survives the session. Capture
          every tool call and prompt, recall it in the next conversation, keep
          everything on your own machine.
        </p>
        <div className={styles.cta}>
          <HeroNpxCommand />
          <div className={styles.ctaSecondary}>
            <a href="#live" className="btn btn--ghost">
              See it move
            </a>
            <GitHubStarButton
              repo="rohitg00/agentmemory"
              initialStars={stats.stars > 0 ? stats.stars : undefined}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
