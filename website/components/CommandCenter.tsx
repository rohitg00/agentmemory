"use client";

import { useState } from "react";
import Image from "next/image";
import styles from "./CommandCenter.module.css";

type Tab = "viewer" | "console" | "state" | "traces";

const TABS: Array<{ id: Tab; label: string; sub: string }> = [
  { id: "viewer", label: "Viewer", sub: ":3113 · LIVE OBSERVATION STREAM" },
  { id: "console", label: "iii Console", sub: ":3114 · ENGINE DASHBOARD" },
  { id: "state", label: "State", sub: "RAW KV BROWSER + JSON EDITOR" },
  { id: "traces", label: "Traces", sub: "OTEL WATERFALL + FLAME" },
];

function buildPanels(restEndpoints: number): Record<
  Tab,
  {
    title: string;
    blurb: string;
    bullets: string[];
    img: string;
    alt: string;
    launch: string;
  }
> {
  return {
    viewer: {
      title: "Ship-with viewer · port 3113",
      blurb:
        "The agentmemory server auto-starts a real-time viewer on port 3113. No install, no config. Tabs refresh live as hooks fire, and any past session replays in place.",
      bullets: [
        "LIVE OBSERVATION STREAM · EVERY HOOK AS IT FIRES",
        "SESSION EXPLORER · REPLAY ANY PAST SESSION",
        "MEMORY BROWSER · FILTER BY PROJECT / TYPE / CONFIDENCE",
        "KNOWLEDGE GRAPH VISUALIZATION · FORCE-DIRECTED",
        "HEALTH DASHBOARD · HEAP / RSS / EVENT LOOP LAG",
      ],
      img: "/demo.gif",
      alt: "agentmemory viewer live demo",
      launch: "open http://localhost:3113",
    },
    console: {
      title: "iii console · first-class",
      blurb:
        "agentmemory runs on the iii engine, so the official iii console gives engine-level visibility: every function call, every worker, every queue, every trace. From v0.9.16 the agentmemory CLI prompts to install iii console alongside the engine. Launch on :3114 so the viewer keeps :3113.",
      bullets: [
        "REGISTERED FUNCTIONS · INVOKE ANY DIRECTLY WITH JSON",
        `${restEndpoints} HTTP ENDPOINTS · REPLAY ANY REST CALL`,
        "WEBSOCKET STREAM MONITOR · WATCH FRAMES LIVE",
        "OTEL EXPORTER = MEMORY (DEFAULT) · TRACES STAY LOCAL",
        "NO AUTH · BIND TO 127.0.0.1 ONLY",
      ],
      img: "/dashboard.png",
      alt: "iii console dashboard",
      launch: "iii-console --port 3114 --engine-port 3111",
    },
    state: {
      title: "Raw KV browser",
      blurb:
        "Three-panel view of the key/value store behind every memory, session, retention score, audit row, and access log. Edit JSON in place.",
      bullets: [
        "SCOPED NAMESPACES · mem:memories / mem:sessions / mem:retention",
        "JSON-NATIVE EDIT · NO MIGRATIONS",
        "AUDIT ROW PER CHANGE · FORENSIC TRAIL",
        "BACKED BY iii STATE ADAPTERS · IN-MEMORY OR FILE-BASED",
      ],
      img: "/states.png",
      alt: "iii console state browser",
      launch: "open http://localhost:3114/states",
    },
    traces: {
      title: "OpenTelemetry out of the box",
      blurb:
        "iii-observability ships with exporter: memory, sampling_ratio: 1.0. Every memory operation emits a trace span + structured log. Swap to OTLP for any external tracing backend.",
      bullets: [
        "WATERFALL · FLAME · SERVICE BREAKDOWN · TRACE MAP",
        "FILTER BY TRACE ID · SERVICE · DURATION",
        "MEMORY SEARCH SPAN TREE · BM25 → VECTOR → GRAPH → RERANK",
        "SWAP EXPORTER TO OTLP FOR PROD TELEMETRY",
      ],
      img: "/traces-waterfall.png",
      alt: "iii console traces waterfall",
      launch: "open http://localhost:3114/traces",
    },
  };
}

export function CommandCenter({ restEndpoints }: { restEndpoints: number }) {
  const [tab, setTab] = useState<Tab>("viewer");
  const panel = buildPanels(restEndpoints)[tab];

  return (
    <section
      className={styles.wrap}
      id="command-center"
      aria-labelledby="cc-title"
    >
      <header className="section-head">
        <span className="section-eyebrow">Command center</span>
        <h2 id="cc-title" className="section-title">
          Two UIs.<br />One memory runtime.
        </h2>
        <p className="section-lede">
          agentmemory ships a real-time viewer for your memories and an
          engine-level console for every function, trigger, and OTel span.
          Both are first-class, installed inline by the CLI on first run.
        </p>
      </header>
      <div className={styles.tabs} role="tablist" aria-label="Command center">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span className={styles.tabLabel}>{t.label}</span>
            <span className={styles.tabSub}>{t.sub}</span>
          </button>
        ))}
      </div>
      <div className={styles.panel}>
        <div className={styles.panelText}>
          <h3 className={styles.panelTitle}>{panel.title}</h3>
          <p className={styles.panelBlurb}>{panel.blurb}</p>
          <ul className={styles.panelBullets}>
            {panel.bullets.map((b) => (
              <li key={b}>
                <span aria-hidden>›</span>
                {b}
              </li>
            ))}
          </ul>
          <pre className={styles.launch}>
            <code>
              <span className={styles.launchPrompt}>$</span> {panel.launch}
            </code>
          </pre>
        </div>
        <div className={styles.panelFrame}>
          <div className={styles.frameChrome}>
            <span className={`${styles.dot} ${styles.red}`} />
            <span className={`${styles.dot} ${styles.yellow}`} />
            <span className={`${styles.dot} ${styles.green}`} />
            <span className={styles.frameTitle}>{panel.title}</span>
          </div>
          <div className={styles.frameShot}>
            <Image
              src={panel.img}
              alt={panel.alt}
              width={1600}
              height={1000}
              unoptimized={panel.img.endsWith(".gif")}
              priority={false}
              style={{ width: "100%", height: "auto", display: "block" }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
