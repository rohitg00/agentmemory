"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { src } from "@/lib/site";
import s from "./ContextFunnel.module.css";

const COLS = 15;
const AGENTS = [
  { name: "claude-code", rows: 5, tone: "a" },
  { name: "cursor", rows: 4, tone: "b" },
  { name: "codex", rows: 4, tone: "c" },
];
const TOTAL = COLS * AGENTS.reduce((n, a) => n + a.rows, 0);
const SELECTED = new Set([3, 17, 29, 41, 52, 66, 79, 88, 101, 114, 126, 139, 151, 163, 176, 188]);
const STEPS = ["capture", "dedupe", "rank", "budget"];

function tone(index: number) {
  const row = Math.floor(index / COLS);
  let acc = 0;
  for (const a of AGENTS) {
    acc += a.rows;
    if (row < acc) return a.tone;
  }
  return "c";
}

function v(name: string, value: number | string): CSSProperties {
  return { [name]: value } as CSSProperties;
}

export function ContextFunnel() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add(s.play);
          timer = setTimeout(() => el.classList.add(s.focus), 1400);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, []);


  return (
    <section id="value" className="section" aria-labelledby="value-h">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">What your agent gets</span>
          <h2 id="value-h">Relevant context, within a budget you control.</h2>
          <p>
            Recall by project and agent, select saved memories, and expand a source when you need more detail.
            The diagram illustrates selection from shared history; the amount returned depends on the query and budget.
          </p>
        </div>

        <div ref={ref} className={s.figure}>
          <div className={`${s.col} ${s.history}`}>
            <div className={s.colHead}>
              <span className="mono">your history</span>
              <span className={`mono ${s.count}`}>shared history</span>
            </div>
            <div className={s.grid} role="img" aria-label={`${TOTAL} illustrative history items from three agents. ${SELECTED.size} of them are selected as relevant.`}>
              {Array.from({ length: TOTAL }, (_, i) => (
                <span
                  key={i}
                  className={`${s.sq} ${s[tone(i)]} ${SELECTED.has(i) ? s.sel : ""}`}
                  style={v("--r", Math.floor(i / COLS))}
                />
              ))}
            </div>
            <ul className={s.legend}>
              {AGENTS.map((a) => (
                <li key={a.name}>
                  <span className={`${s.swatch} ${s[a.tone]}`} />
                  <span className="mono">{a.name}</span>
                </li>
              ))}
              <li className={s.legendNote}>
                <span className="mono">illustrative history items</span>
              </li>
            </ul>
          </div>

          <div className={s.flow} aria-hidden="true">
            <span className="flow-arrow" />
          </div>

          <div className={`${s.col} ${s.engine}`}>
            <div className={s.engineCard}>
              <span className={`mono ${s.engineHead}`}>agentmemory</span>
              <span className={`mono ${s.engineSub}`}>127.0.0.1 · on your machine</span>
              <ol className={s.steps}>
                {STEPS.map((step, i) => (
                  <li key={step} style={v("--i", i)}>
                    <span className={s.tick} />
                    <span className="mono">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className={s.flow} aria-hidden="true">
            <span className="flow-arrow" />
          </div>

          <div className={`${s.col} ${s.window}`}>
            <div className={s.colHead}>
              <span className="mono">next session · context window</span>
            </div>
            <div className={s.ctx}>
              <div className={s.injected}>
                <span className={`mono ${s.injHead}`}>
                  relevant context
                </span>
                <div className={s.slots}>
                  {Array.from({ length: SELECTED.size }, (_, i) => (
                    <span key={i} className={s.slot} style={v("--i", i)} />
                  ))}
                </div>
              </div>
              <div className={s.free}>
                <span className={`mono ${s.prompt}`}>› your prompt</span>
                <span className={`mono ${s.freeLabel}`}>free for your task</span>
              </div>
            </div>
          </div>
        </div>

        <ul className={s.outcomes}>
          <li>
            <span className={s.big}>Scoped</span>
            <span className={s.what}>filter recall by project and agent</span>
            <a className="src" href={src.recall} target="_blank" rel="noreferrer">
              recall guide
            </a>
          </li>
          <li>
            <span className={s.big}>Budgeted</span>
            <span className={s.what}>choose how much context to retrieve</span>
            <a className="src" href={src.recall} target="_blank" rel="noreferrer">
              context budgets
            </a>
          </li>
          <li>
            <span className={s.big}>Expandable</span>
            <span className={s.what}>follow a result back to its full source</span>
            <a className="src" href={src.recall} target="_blank" rel="noreferrer">
              source expansion
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}
