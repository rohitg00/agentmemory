"use client";

import { useEffect, useState } from "react";
import styles from "./GitHubStarButton.module.css";

interface Props {
  repo: string;
}

function formatStars(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}

export function GitHubStarButton({ repo }: Props) {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `gh-stars:${repo}`;
    const cached = typeof window !== "undefined" ? window.localStorage.getItem(cacheKey) : null;
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { value: number; at: number };
        if (Date.now() - parsed.at < 30 * 60 * 1000) {
          setStars(parsed.value);
        }
      } catch {
        /* ignore */
      }
    }
    (async () => {
      try {
        const res = await fetch(`https://api.github.com/repos/${repo}`, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { stargazers_count?: number };
        if (cancelled) return;
        if (typeof data.stargazers_count === "number") {
          setStars(data.stargazers_count);
          try {
            window.localStorage.setItem(
              cacheKey,
              JSON.stringify({ value: data.stargazers_count, at: Date.now() }),
            );
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* offline / blocked — keep cached or null */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo]);

  return (
    <a
      href={`https://github.com/${repo}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`btn btn--ghost ${styles.starBtn}`}
      aria-label={`Star ${repo} on GitHub`}
    >
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        width="18"
        height="18"
        className={styles.icon}
        fill="currentColor"
      >
        <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
      </svg>
      <span className={styles.label}>STAR</span>
      {stars !== null && <span className={styles.count}>{formatStars(stars)}</span>}
    </a>
  );
}
