"use client";

import { useEffect, useRef, useState } from "react";
import { GATE_SCENARIOS } from "@/lib/site";
import { GATE_NOTES, GATE_SOURCE, GATE_WORKFLOW } from "@/lib/trust";
import s from "./Durability.module.css";

const STEP_MS = 380;

type RowState = "pass" | "run" | "wait";

const STATUS_LABEL: Record<RowState, string> = { pass: "passed", run: "running", wait: "pending" };

function rowState(i: number, done: number, finished: boolean): RowState {
  if (finished || i < done) return "pass";
  if (i === done) return "run";
  return "wait";
}

export function Durability() {
  const ref = useRef<HTMLDivElement | null>(null);
  const total = GATE_SCENARIOS.length;
  const [done, setDone] = useState(-1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDone(total);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        let n = 0;
        const tick = () => {
          setDone(n);
          n += 1;
          if (n <= total) timer = setTimeout(tick, STEP_MS);
        };
        tick();
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [total]);

  const finished = done >= total;

  return (
    <section id="durability" className="section" aria-labelledby="durability-title">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Durability</span>
          <h2 id="durability-title">Every change ships through a crash test.</h2>
          <p>
            Before code reaches main, CI packs the npm tarball, installs it into an empty directory and runs ten
            scenarios against it on Ubuntu and macOS. Three of them kill the server with SIGKILL mid-flight.
          </p>
        </div>

        <div ref={ref} className={s.log}>
          <div className={s.head}>
            <span className="mono">npm run release:gate</span>
            <span className="mono">{`${Math.max(0, done)}/${total}`}</span>
          </div>
          <ol className={s.rows}>
            {GATE_SCENARIOS.map((g, i) => {
              const state = rowState(i, done, finished);
              const note = GATE_NOTES[g.id];
              return (
                <li key={g.id} className={s.row} data-state={state}>
                  <span className={`mono ${s.status}`} aria-label={STATUS_LABEL[state]}>
                    {state}
                  </span>
                  <span className={`mono ${s.id}`}>{g.id}</span>
                  <span className={s.what}>
                    {g.what}
                    {note && <span className={`mono ${s.note}`}>{note}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className={s.verdict} data-on={finished || undefined}>
            <span className="mono">
              {total} of {total} passed on <span className={s.nw}>ubuntu-latest</span> and <span className={s.nw}>macos-latest</span>
            </span>
            <span className={s.links}>
              <a className="src" href={GATE_SOURCE} target="_blank" rel="noreferrer">
                gate source
              </a>
              <a className="src" href={GATE_WORKFLOW} target="_blank" rel="noreferrer">
                workflow
              </a>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
