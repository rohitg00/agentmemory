"use client";

import { useEffect, useRef } from "react";
import styles from "./Primitives.module.css";

const CARDS = [
  {
    glyph: "01",
    title: "HOOKS",
    text:
      "12 AUTO-CAPTURE HOOKS PIPED INTO EVERY CODING AGENT. EVERY TOOL CALL, EVERY PROMPT, EVERY STOP BECOMES A COMPRESSED OBSERVATION.",
  },
  {
    glyph: "02",
    title: "RECALL",
    text:
      "TRIPLE-STREAM RETRIEVAL — BM25 + VECTOR + KNOWLEDGE GRAPH. RERANKED ON DEVICE. P50 UNDER 20MS ON A LAPTOP.",
  },
  {
    glyph: "03",
    title: "CONSOLIDATE",
    text:
      "HOURLY SWEEPS COMPRESS RAW OBSERVATIONS INTO SEMANTIC MEMORIES. DUPLICATES MERGED. STALE ROWS DECAYED. AUDIT ROW EMITTED EVERY DELETE.",
  },
];

export function Primitives() {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !gridRef.current) return;
    const cards = gridRef.current.querySelectorAll<HTMLElement>(
      "[data-tilt]",
    );
    const handlers: Array<[HTMLElement, (e: MouseEvent) => void, () => void]> =
      [];
    cards.forEach((card) => {
      const onMove = (e: MouseEvent) => {
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = `translateY(-4px) rotateX(${(-py * 4).toFixed(
          2,
        )}deg) rotateY(${(px * 4).toFixed(2)}deg)`;
      };
      const onLeave = () => {
        card.style.transform = "";
      };
      card.addEventListener("mousemove", onMove);
      card.addEventListener("mouseleave", onLeave);
      handlers.push([card, onMove, onLeave]);
    });
    return () => {
      handlers.forEach(([el, m, l]) => {
        el.removeEventListener("mousemove", m);
        el.removeEventListener("mouseleave", l);
      });
    };
  }, []);

  return (
    <section className={styles.wrap} id="stack" aria-labelledby="prim-title">
      <header className="section-head">
        <span className="section-eyebrow">THE STACK</span>
        <h2 id="prim-title" className="section-title">
          THREE LAYERS.
          <br />
          NO FRAMEWORK TAX.
        </h2>
        <p className="section-lede">
          BUILT ON THE iii ENGINE — EVERY MEMORY OPERATION IS A WORKER, A
          FUNCTION, OR A TRIGGER. NO REDIS. NO KAFKA. NO POSTGRES. THE ENTIRE
          RUNTIME IS ONE PROCESS.
        </p>
      </header>
      <div className={styles.grid} ref={gridRef}>
        {CARDS.map((c) => (
          <article key={c.glyph} className={styles.card} data-tilt>
            <div className={styles.glyph}>{c.glyph}</div>
            <h3 className={styles.title}>{c.title}</h3>
            <p className={styles.text}>{c.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
