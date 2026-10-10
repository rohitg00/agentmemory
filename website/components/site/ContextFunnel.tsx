"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { LONGMEMEVAL, TOKENS, src } from "@/lib/site";
import s from "./ContextFunnel.module.css";

const COLS = 15;
const AGENTS = [
  { name: "claude-code", rows: 5, tone: "a" },
  { name: "cursor", rows: 4, tone: "b" },
  { name: "codex", rows: 4, tone: "c" },
];
const TOTAL = COLS * AGENTS.reduce((n, a) => n + a.rows, 0);
const SELECTED = new Set([3, 17, 29, 41, 52, 66, 79, 88, 101, 114, 126, 139, 151, 163, 176, 188]);
const STEPS = ["capture", "dedupe", "rank", "compress"];

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

  const saved = Math.round((1 - TOKENS.agentmemory / TOKENS.fullContext) * 100);

  return (
    <section id="value" className="section" aria-labelledby="value-h">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">What your agent gets</span>
          <h2 id="value-h">The {100 - saved}% of your history that matters, every session.</h2>
          <p>
            A month of work across agents is {TOKENS.fullContext.toLocaleString("en-US")} tokens. Pasting all of it buries
            the task. agentmemory hands the next session the {TOKENS.agentmemory.toLocaleString("en-US")} tokens that
            answer it, and leaves the rest of the window for the work.
          </p>
        </div>

        <div ref={ref} className={s.figure}>
          <div className={`${s.col} ${s.history}`}>
            <div className={s.colHead}>
              <span className="mono">your history</span>
              <span className={`mono ${s.count}`}>{TOKENS.fullContext.toLocaleString("en-US")} tokens</span>
            </div>
            <div className={s.grid} role="img" aria-label={`${TOTAL} squares, about 100 tokens each, from three agents. ${SELECTED.size} of them are selected as relevant.`}>
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
                <span className="mono">1 square ≈ 100 tokens</span>
              </li>
            </ul>
          </div>

          <div className={s.flow} aria-hidden="true">
            <span className={s.arrow} />
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
            <span className={s.arrow} />
          </div>

          <div className={`${s.col} ${s.window}`}>
            <div className={s.colHead}>
              <span className="mono">next session · context window</span>
            </div>
            <div className={s.ctx}>
              <div className={s.injected}>
                <span className={`mono ${s.injHead}`}>
                  SessionStart · {TOKENS.agentmemory.toLocaleString("en-US")} tokens
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
            <span className={s.big}>{LONGMEMEVAL.hybrid.r5}%</span>
            <span className={s.what}>of questions find the right past session in the top 5</span>
            <a className="src" href={src.longmemeval} target="_blank" rel="noreferrer">
              LongMemEval-S
            </a>
          </li>
          <li>
            <span className={s.big}>{TOKENS.savedPct}%</span>
            <span className={s.what}>fewer input tokens than pasting your whole history</span>
            <a className="src" href={src.tokens} target="_blank" rel="noreferrer">
              240 observations, 30 sessions, v0.6.0
            </a>
          </li>
          <li>
            <span className={s.big}>14 ms</span>
            <span className={s.what}>median recall, with nothing sent over the network</span>
            <a className="src" href={src.agentLife} target="_blank" rel="noreferrer">
              coding-agent-life-v1 on v0.9.26
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}
