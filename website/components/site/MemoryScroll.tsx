"use client";

import { useScrollProgress } from "./client";
import s from "./MemoryScroll.module.css";

const STEPS = [
  {
    n: "01",
    title: "Capture",
    body: "Hooks fire on every prompt and tool call. Each event is posted to the local server on :3111 with a restart-safe id, or spooled to disk if the server is down.",
  },
  {
    n: "02",
    title: "Store",
    body: "Each event becomes an observation in the local store on your machine: the tool, the file, a bounded copy of the output, and the session it came from.",
  },
  {
    n: "03",
    title: "Index",
    body: "Observations are indexed twice: BM25 terms for exact words, and vectors for meaning. Local embeddings work with no API key.",
  },
  {
    n: "04",
    title: "Consolidate",
    body: "When the session ends, related observations collapse into one memory. It keeps links back to every observation it came from.",
  },
  {
    n: "05",
    title: "Recall",
    body: "The next session opens with the right memory already in context. Your agent starts in the right file instead of from zero.",
  },
];

const MON = [
  { tool: "user", arg: "login randomly fails after ~15 minutes", out: "" },
  { tool: "Read", arg: "src/auth/session.ts", out: "" },
  { tool: "Bash", arg: "npm test -- auth", out: "2 failed" },
  { tool: "Edit", arg: "src/auth/refresh.ts", out: "+18 −4" },
  { tool: "Bash", arg: "npm test -- auth", out: "41 passed" },
];

const OBS = [
  { id: "obs_01", kind: "prompt", text: "login randomly fails after ~15 minutes", terms: ["login", "fail", "15m"] },
  { id: "obs_02", kind: "Read", text: "src/auth/session.ts", terms: ["session", "token", "expiry"] },
  { id: "obs_03", kind: "Bash", text: "npm test -- auth · 2 failed", terms: ["auth", "test", "fail"] },
  { id: "obs_04", kind: "Edit", text: "src/auth/refresh.ts", terms: ["refresh", "token"] },
  { id: "obs_05", kind: "Bash", text: "npm test -- auth · 41 passed", terms: ["auth", "test", "pass"] },
];

const MEMORY = "Session tokens expire after 15 minutes. Refresh runs in src/auth/refresh.ts. Verify with npm test -- auth.";

function win(a: number, b: number, a2?: number, b2?: number, opts: { dim?: number; lift?: boolean } = {}) {
  const attrs: Record<string, string> = { "data-a": String(a), "data-b": String(b) };
  if (a2 !== undefined && b2 !== undefined) {
    attrs["data-a2"] = String(a2);
    attrs["data-b2"] = String(b2);
  }
  if (opts.dim !== undefined) attrs["data-dim"] = String(opts.dim);
  if (opts.lift) attrs["data-lift"] = "1";
  return attrs;
}

export function MemoryScroll() {
  const ref = useScrollProgress<HTMLDivElement>(STEPS.length);

  return (
    <section id="how" className={`section ${s.section}`} aria-labelledby="how-title">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">How it works</span>
          <h2 id="how-title">From one tool call to the next session.</h2>
          <p>Scroll through one real bug fix. Monday&apos;s session gets captured, indexed and consolidated. Tuesday&apos;s session starts already knowing it.</p>
        </div>
      </div>

      <div ref={ref} className={s.track} data-step="0">
        <div className={s.sticky}>
          <div className={`wrap ${s.stage}`}>
            <div className={s.side}>
              <ol className={s.steps}>
                {STEPS.map((st, i) => (
                  <li key={st.n} className={s.step} data-i={i}>
                    <span className={`mono ${s.num}`}>{st.n}</span>
                    <h3>{st.title}</h3>
                  </li>
                ))}
                <li className={s.rail} aria-hidden="true">
                  <span data-rail="" />
                </li>
              </ol>
              <div className={s.details}>
                {STEPS.map((st, i) => (
                  <p key={st.n} className={s.detail} data-i={i}>
                    <span className={s.detailTitle}>
                      {st.n} {st.title}.{" "}
                    </span>
                    {st.body}
                  </p>
                ))}
              </div>
            </div>

            <div className={s.figure} aria-hidden="true">
              <div className={`${s.pane} ${s.sessionPane}`}>
                <div className={s.paneHead}>
                  <span className="mono">agent session</span>
                  <span className={`mono ${s.day}`}>
                    <span className={`${s.k} ${s.monLabel}`} {...win(-1, 0, 0.8, 0.84)}>
                      monday 14:02
                    </span>
                    <span className={`${s.k} ${s.tueLabel}`} {...win(0.82, 0.86)}>
                      tuesday 09:41
                    </span>
                  </span>
                </div>
                <div className={s.sessionBody}>
                  <ul className={`${s.k} ${s.mon}`} {...win(-1, 0, 0.8, 0.84)}>
                    {MON.map((m, i) => (
                      <li key={i} className={`${s.k} ${s.line}`} {...win(0.015 + i * 0.03, 0.04 + i * 0.03)}>
                        <span className={m.tool === "user" ? s.user : s.tool}>{m.tool === "user" ? "›" : m.tool}</span>
                        <span className={s.arg}>{m.arg}</span>
                        {m.out && <span className={s.out}>{m.out}</span>}
                      </li>
                    ))}
                  </ul>
                  <ul className={`${s.k} ${s.tue}`} {...win(0.83, 0.87)}>
                    <li className={`${s.k} ${s.line}`} {...win(0.85, 0.88)}>
                      <span className={s.user}>›</span>
                      <span className={s.arg}>add a &quot;remember me&quot; option to login</span>
                    </li>
                    <li className={`${s.k} ${s.inject}`} {...win(0.88, 0.92)}>
                      <span className={`mono ${s.injectHead}`}>SessionStart · agentmemory context · 1 memory</span>
                      <span>{MEMORY}</span>
                    </li>
                    <li className={`${s.k} ${s.line}`} {...win(0.93, 0.96)}>
                      <span className={s.tool}>Read</span>
                      <span className={s.arg}>src/auth/refresh.ts</span>
                      <span className={s.out}>right file, first try</span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className={`${s.pane} ${s.storePane}`}>
                <div className={s.paneHead}>
                  <span className="mono">local store</span>
                  <span className={`mono ${s.k} ${s.hookTag}`} {...win(0.02, 0.05)}>
                    POST :3111/agentmemory/observe
                  </span>
                </div>
                <div className={s.store}>
                  <div className={s.group}>
                    <span className={`mono ${s.groupHead}`}>observations · mem:obs</span>
                    <ul className={s.obsList}>
                      {OBS.map((o, i) => (
                        <li key={o.id} className={`${s.k} ${s.obs}`} {...win(0.2 + i * 0.03, 0.23 + i * 0.03, 0.66, 0.74, { dim: 0.62 })}>
                          <span className={s.obsId}>{o.id}</span>
                          <span className={s.obsKind}>{o.kind}</span>
                          <span className={s.obsText}>{o.text}</span>
                          <span className={`${s.k} ${s.terms}`} {...win(0.42 + i * 0.025, 0.45 + i * 0.025)}>
                            {o.terms.map((t) => (
                              <span key={t}>{t}</span>
                            ))}
                            <span className={s.vec}>vec</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={`${s.k} ${s.indexLine}`} {...win(0.54, 0.58)}>
                    <span className="mono">bm25 · 10 terms</span>
                    <span className="mono">vectors · 5 × 384d</span>
                    <span className="mono">searchable</span>
                  </div>
                  <div className={`${s.k} ${s.memory}`} {...win(0.66, 0.74, undefined, undefined, { lift: true })}>
                    <span className={`mono ${s.groupHead}`}>memory · auth</span>
                    <p>{MEMORY}</p>
                    <span className={`mono ${s.prov}`}>from obs_02 · obs_03 · obs_04 · obs_05</span>
                  </div>
                  <div className={`${s.k} ${s.recallLine}`} {...win(0.86, 0.9)}>
                    <span className="mono">recalled into tuesday&apos;s session</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
