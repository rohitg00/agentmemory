"use client";

import { useEffect, useRef } from "react";
import styles from "./Stats.module.css";

interface StatItem {
  target: number;
  suffix?: string;
  label: string;
  float?: boolean;
}

export function Stats({
  mcpTools,
  hooks,
  restEndpoints,
  testsPassing,
}: {
  mcpTools: number;
  hooks: number;
  restEndpoints: number;
  testsPassing: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  const STATS: StatItem[] = [
    { target: 95.2, suffix: "%", label: "RETRIEVAL R@5 · LONGMEMEVAL-S", float: true },
    { target: 92, suffix: "%", label: "FEWER INPUT TOKENS PER SESSION" },
    { target: mcpTools, label: "MCP TOOLS" },
    { target: restEndpoints, label: "REST ENDPOINTS" },
    { target: 0, label: "EXTERNAL DATABASES" },
    { target: testsPassing, label: "TESTS PASSING" },
  ];

  useEffect(() => {
    if (!rootRef.current) return;
    const root = rootRef.current;

    // Reset per-element done flag so deps changing (e.g. a new meta snapshot
    // at build) replays the count animation against the new target.
    root
      .querySelectorAll<HTMLDivElement>("[data-num]")
      .forEach((el) => delete el.dataset.done);

    const count = (el: HTMLDivElement) => {
      const target = Number(el.dataset.target);
      const suffix = el.dataset.suffix || "";
      const isFloat = el.dataset.float === "1";
      const startAt = performance.now();
      const duration = 1400;
      const tick = (now: number) => {
        const t = Math.min(1, (now - startAt) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const v = target * eased;
        el.textContent = isFloat
          ? `${v.toFixed(1)}${suffix}`
          : `${Math.round(v)}${suffix}`;
        if (t < 1) requestAnimationFrame(tick);
        else
          el.textContent = isFloat
            ? `${target.toFixed(1)}${suffix}`
            : `${target}${suffix}`;
      };
      requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLDivElement;
          const num = el.querySelector<HTMLDivElement>("[data-num]");
          if (num && !num.dataset.done) {
            num.dataset.done = "1";
            count(num);
          }
          io.unobserve(el);
        }
      },
      { threshold: 0.5 },
    );

    root
      .querySelectorAll<HTMLDivElement>("[data-stat]")
      .forEach((el) => io.observe(el));

    return () => io.disconnect();
  }, [mcpTools, hooks, restEndpoints, testsPassing]);

  return (
    <section className={styles.stats} aria-label="By the numbers">
      <div className={styles.row} ref={rootRef}>
        {STATS.map((s) => (
          <article key={s.label} className={styles.stat} data-stat>
            <div
              className={styles.num}
              data-num
              data-target={s.target}
              data-suffix={s.suffix || ""}
              data-float={s.float ? "1" : "0"}
            >
              {s.float ? s.target.toFixed(1) : s.target}
              {s.suffix || ""}
            </div>
            <div className={styles.label}>{s.label}</div>
          </article>
        ))}
      </div>
    </section>
  );
}
