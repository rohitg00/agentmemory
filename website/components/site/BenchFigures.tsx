"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LONGMEMEVAL } from "@/lib/site";
import { TYPE_HITS, totalHits, type K } from "@/lib/bench";
import s from "./Benchmarks.module.css";

function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, inView] as const;
}

const LEDGER: { key: keyof typeof LONGMEMEVAL.hybrid; label: string; k?: K }[] = [
  { key: "r5", label: "R@5", k: 5 },
  { key: "r10", label: "R@10", k: 10 },
  { key: "r20", label: "R@20" },
  { key: "ndcg10", label: "NDCG@10" },
  { key: "mrr", label: "MRR" },
];

function dotDelay(i: number, lit: boolean, before: number, firstReveal: boolean): number {
  if (firstReveal) return Math.min(i * 4, 420);
  if (lit && i >= before) return Math.min((i - before) * 45, 400);
  return 0;
}

export function QuestionDots() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [k, setK] = useState<K>(5);
  const [prevK, setPrevK] = useState<K | null>(null);
  const hits = totalHits(k);

  const choose = (next: K) => {
    if (next === k) return;
    setPrevK(k);
    setK(next);
  };

  return (
    <div ref={ref} className={s.dotsFigure}>
      <div className={s.figHead}>
        <span className="mono">LongMemEval-S · 500 questions · one dot each</span>
        <div className={s.toggle} role="group" aria-label="Retrieved sessions per question">
          {([5, 10] as K[]).map((v) => (
            <button key={v} type="button" aria-pressed={k === v} onClick={() => choose(v)}>
              top {v}
            </button>
          ))}
        </div>
      </div>

      <p className={s.verdict}>
        <strong>
          {hits} of {LONGMEMEVAL.questions}
        </strong>{" "}
        questions found a gold session in the top {k} results.
      </p>

      <div className={s.groups}>
        {TYPE_HITS.map((t) => {
          const on = t.hits[k];
          const before = prevK ? t.hits[prevK] : 0;
          return (
            <div key={t.type} className={s.group}>
              <div className={s.groupHead}>
                <span className="mono">{t.type}</span>
                <span className="mono">
                  {on} / {t.count}
                </span>
              </div>
              <div className={s.dots} aria-hidden="true">
                {Array.from({ length: t.count }, (_, i) => {
                  const lit = inView && i < on;
                  const delay = dotDelay(i, lit, before, prevK === null);
                  return (
                    <span key={i} className={s.dot} data-on={lit || undefined}>
                      <span className={s.fill} style={{ "--d": `${delay}ms` } as CSSProperties} />
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className={s.legend}>
        <span className="mono">
          <span className={`${s.key} ${s.keyOn}`} /> gold session retrieved
        </span>
        <span className="mono">
          <span className={s.key} /> missed
        </span>
      </div>

      <div className={s.ledgerWrap}>
        <table className={s.ledger}>
          <thead>
            <tr>
              <th scope="col">recall mode</th>
              {LEDGER.map((c) => (
                <th key={c.key} scope="col" data-active={c.k === k || undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">BM25 + vectors</th>
              {LEDGER.map((c) => (
                <td key={c.key} data-active={c.k === k || undefined}>
                  {LONGMEMEVAL.hybrid[c.key].toFixed(1)}%
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">BM25 only, keyless</th>
              {LEDGER.map((c) => (
                <td key={c.key} data-active={c.k === k || undefined}>
                  {LONGMEMEVAL.bm25[c.key].toFixed(1)}%
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
