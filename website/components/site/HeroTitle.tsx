"use client";

import { useEffect, useState } from "react";
import s from "./HeroTitle.module.css";

const MODES = ["persistent", "cross-agent", "infinite", "shared", "local", "long-term"];

const AGENTS = [
  { name: "Claude Code", logo: "https://svgl.app/library/claude-ai-icon.svg" },
  { name: "Cursor", logo: "https://svgl.app/library/cursor_light.svg" },
  { name: "Codex", logo: "https://svgl.app/library/openai.svg" },
  { name: "OpenClaw", logo: "https://github.com/openclaw.png" },
  { name: "OpenCode", logo: "/opencode.png" },
  { name: "Hermes", logo: "https://github.com/NousResearch.png" },
];

const STEP = 2400;

export function HeroTitle({ rankHref }: { rankHref: string }) {
  const [mode, setMode] = useState(0);
  const [agent, setAgent] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let tick = 0;
    let visible = !document.hidden;
    const onVis = () => {
      visible = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVis);
    const id = setInterval(() => {
      if (!visible) return;
      tick += 1;
      if (tick % 2 === 1) setAgent((a) => (a + 1) % AGENTS.length);
      else setMode((m) => (m + 1) % MODES.length);
    }, STEP / 2);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <h1 className={s.title}>
      <span className="sr-only">The number one persistent memory for coding agents.</span>
      <span aria-hidden="true" className={s.line}>
        <a className={s.rank} href={rankHref} target="_blank" rel="noreferrer" tabIndex={-1}>
          #1
        </a>{" "}
        <span className={s.slot}>
          {MODES.map((m, i) => (
            <span key={m} className={s.item} data-on={i === mode || undefined}>
              {m}
            </span>
          ))}
        </span>
      </span>
      <span aria-hidden="true" className={s.line}>
        memory for
      </span>
      <span aria-hidden="true" className={s.line}>
        <span className={s.slot}>
          {AGENTS.map((a, i) => (
            <span key={a.name} className={`${s.item} ${s.agent}`} data-on={i === agent || undefined}>
              <img src={a.logo} alt="" width={64} height={64} className={s.logo} />
              {a.name}
            </span>
          ))}
        </span>
      </span>
    </h1>
  );
}
