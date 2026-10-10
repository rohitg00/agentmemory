"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { INTERFACES } from "@/lib/rest";
import s from "./Interfaces.module.css";

export function Interfaces() {
  const [active, setActive] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const panel = INTERFACES[active];

  const select = (i: number, focus = false) => {
    setActive(i);
    setSeen((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
    if (focus) tabs.current[i]?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = INTERFACES.length;
    if (e.key === "ArrowRight") select((active + 1) % n, true);
    else if (e.key === "ArrowLeft") select((active - 1 + n) % n, true);
    else if (e.key === "Home") select(0, true);
    else if (e.key === "End") select(n - 1, true);
    else return;
    e.preventDefault();
  };

  return (
    <section id="interfaces" className="section" aria-labelledby="interfaces-title">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Interfaces</span>
          <h2 id="interfaces-title">See your agent&apos;s memory.</h2>
          <p>Nothing is a black box. Every observation, memory and function call is visible from your browser, served from your machine.</p>
        </div>

        <div className={s.tabs} role="tablist" aria-label="agentmemory interfaces" onKeyDown={onKey}>
          {INTERFACES.map((it, i) => (
            <button
              key={it.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${it.id}`}
              aria-selected={i === active}
              aria-controls={`panel-${it.id}`}
              tabIndex={i === active ? 0 : -1}
              className={s.tab}
              onClick={() => select(i)}
            >
              <span>{it.label}</span>
              <span className="mono">{it.port}</span>
            </button>
          ))}
        </div>

        <div className={s.body}>
          <div className={s.text} role="tabpanel" id={`panel-${panel.id}`} aria-labelledby={`tab-${panel.id}`} key={panel.id}>
            <h3>{panel.title}</h3>
            <p>{panel.body}</p>
            <ul>
              {panel.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <code className={s.launch}>
              <span aria-hidden="true">$ </span>
              {panel.launch}
            </code>
          </div>
          <div className={s.frame}>
            <div className={s.chrome} aria-hidden="true">
              <span />
              <span />
              <span />
              <span className="mono">localhost{panel.port}</span>
            </div>
            <div className={s.shots} style={{ aspectRatio: "16 / 9.1" }}>
              {INTERFACES.map((it, i) =>
                seen.has(i) ? (
                  <img
                    key={it.id}
                    src={it.img}
                    alt={it.alt}
                    width={it.width}
                    height={it.height}
                    className={s.shot}
                    data-on={i === active || undefined}
                    loading={i === 0 ? "lazy" : "eager"}
                    decoding="async"
                  />
                ) : null,
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
