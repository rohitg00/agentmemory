"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ADAPTERS, ADAPTER_LABELS, EVALUATION, TYPE_HITS, totalHits, percent, type Adapter } from "@/lib/bench";
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

function dotDelay(i: number, lit: boolean, before: number, firstReveal: boolean): number {
  if (firstReveal) return Math.min(i * 4, 420);
  if (lit && i >= before) return Math.min((i - before) * 45, 400);
  return 0;
}

export function QuestionDots() {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [adapter, setAdapter] = useState<Adapter>("agentmemory-bm25-component");
  const [previous, setPrevious] = useState<Adapter | null>(null);
  const hits = totalHits(adapter);

  const choose = (next: Adapter) => {
    if (next === adapter) return;
    setPrevious(adapter);
    setAdapter(next);
  };

  return (
    <div ref={ref} className={s.dotsFigure}>
      <div className={s.figHead}>
        <span className="mono">LongMemEval-S · 470 answerable questions</span>
        <div className={s.toggle} role="group" aria-label="Retrieval adapter">
          {ADAPTERS.map((v) => (
            <button key={v} type="button" aria-pressed={adapter === v} onClick={() => choose(v)}>
              {ADAPTER_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      <p className={s.verdict}>
        <strong>
          {hits} of {EVALUATION.longmemeval.byAdapter[adapter].scored}
        </strong>{" "}
        questions found every required source in the top 5 results.
      </p>

      <div className={s.groups}>
        {TYPE_HITS.map((t) => {
          const on = t.hits[adapter];
          const before = previous ? t.hits[previous] : 0;
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
                  const delay = dotDelay(i, lit, before, previous === null);
                  return (
                    <span key={i} className={s.dot} data-on={lit || undefined} data-hit={i < on || undefined}>
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
          <span className={`${s.key} ${s.keyOn}`} /> all required sources retrieved
        </span>
        <span className="mono">
          <span className={s.key} /> incomplete
        </span>
      </div>

      <div className={s.ledgerWrap}>
        <table className={s.ledger}>
          <thead>
            <tr>
              <th scope="col">recall mode</th>
              <th scope="col">Strict recall-all@5</th>
              <th scope="col">Fractional recall@5</th>
              <th scope="col">Any-hit@5</th>
            </tr>
          </thead>
          <tbody>
            {ADAPTERS.map((key) => {
              const result = EVALUATION.longmemeval.byAdapter[key];
              return <tr key={key}>
                <th scope="row">{ADAPTER_LABELS[key]}</th>
                <td>{percent(result.recallAll)}</td>
                <td>{percent(result.r)}</td>
                <td>{percent(result.hit / result.scored)}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
