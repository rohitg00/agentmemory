"use client";

import Link from "next/link";
import { useState } from "react";
import { AGENTS } from "@/lib/site";
import { LOGO_OVERRIDES } from "@/lib/rest";
import s from "./AgentMarquee.module.css";

function Row({ hidden }: { hidden?: boolean }) {
  return (
    <ul className={s.row} aria-hidden={hidden || undefined}>
      {AGENTS.map((agent) => (
        <li key={agent.name} className={s.item}>
          <span className={s.tile}>
            <img className={s.logo} src={LOGO_OVERRIDES[agent.name] ?? agent.logo} alt="" width={20} height={20} loading="lazy" decoding="async" />
          </span>
          <span className={s.name}>{agent.name}</span>
        </li>
      ))}
    </ul>
  );
}

export function AgentMarquee() {
  const [paused, setPaused] = useState(false);
  return (
    <section className={s.strip} aria-label="Supported coding agents">
      <div className={`wrap ${s.head}`}>
        <span className={`mono ${s.label}`}>One memory across {AGENTS.length} coding agents</span>
        <span className={s.actions}>
          <button type="button" className={`mono ${s.pause}`} aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
            {paused ? "Play" : "Pause"}
          </button>
          <Link className={`mono ${s.all}`} href="/agents">
            See how each one connects
          </Link>
        </span>
      </div>
      <div className={s.viewport}>
        <div className={s.track} data-paused={paused || undefined} style={{ ["--count" as string]: AGENTS.length }}>
          <Row />
          <Row hidden />
        </div>
      </div>
    </section>
  );
}
