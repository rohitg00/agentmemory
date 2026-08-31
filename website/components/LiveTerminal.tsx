"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./LiveTerminal.module.css";

type SegType = "prompt" | "typed" | "plain" | "comment" | "ok" | "val";
interface Seg {
  t: SegType;
  text: string;
}

function buildScript(mcpTools: number, hooks: number): Seg[] {
  return [
    { t: "prompt", text: "$ " },
    { t: "typed", text: "npx @agentmemory/agentmemory\n" },
    { t: "plain", text: "[agentmemory] iii-engine ready on :3111\n" },
    { t: "plain", text: `[agentmemory] ${mcpTools} MCP tools registered\n` },
    { t: "plain", text: `[agentmemory] ${hooks} autohooks armed\n\n` },
    { t: "prompt", text: "$ " },
    {
      t: "typed",
      text: 'memory.recall({ query: "where did we land the retry logic?" })\n',
    },
    { t: "comment", text: "// hybrid retrieval: BM25 + vector + graph\n" },
    { t: "ok", text: "✓ 3 memories · reranked on device\n\n" },
    { t: "plain", text: "→ " },
    { t: "val", text: "src/retry.ts:47 · exponentialBackoff(max=5, jitter=true)\n" },
    { t: "plain", text: "→ " },
    {
      t: "val",
      text: 'commit 8f2e14c · "resolve conflict + honor x-amz headers"\n',
    },
    { t: "plain", text: "→ " },
    {
      t: "val",
      text: 'session 2026-04-16 · "bug: race when Retry-After is empty"\n\n',
    },
    { t: "prompt", text: "$ " },
    { t: "typed", text: "memory.consolidate({ project: 'pay-api' })\n" },
    { t: "ok", text: "✓ raw observations → semantic memories · audit rows written\n" },
  ];
}

function classFor(type: SegType) {
  switch (type) {
    case "prompt":
      return styles.prompt;
    case "comment":
      return styles.comment;
    case "ok":
      return styles.ok;
    case "val":
      return styles.val;
    default:
      return "";
  }
}

export function LiveTerminal({
  mcpTools,
  hooks,
}: {
  mcpTools: number;
  hooks: number;
}) {
  const termRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState("IDLE");
  const runningRef = useRef(false);
  const played = useRef(false);

  const play = useCallback(async () => {
    const term = termRef.current;
    if (!term || runningRef.current) return;
    runningRef.current = true;
    setStatus("RUNNING");
    term.innerHTML = "";
    const caret = document.createElement("span");
    caret.className = styles.caret;
    term.appendChild(caret);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const script = buildScript(mcpTools, hooks);

    for (const seg of script) {
      const span = document.createElement("span");
      const c = classFor(seg.t);
      if (c) span.className = c;
      term.insertBefore(span, caret);
      if (seg.t === "typed") {
        for (const ch of seg.text) {
          span.textContent += ch;
          await new Promise((r) =>
            setTimeout(r, reduce ? 0 : 16 + Math.random() * 34),
          );
        }
        await new Promise((r) => setTimeout(r, reduce ? 0 : 260));
      } else {
        span.textContent = seg.text;
        await new Promise((r) => setTimeout(r, reduce ? 0 : 160));
      }
    }
    setStatus("DONE");
    runningRef.current = false;
  }, [mcpTools, hooks]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    const host = term.closest("[data-terminal]");
    if (!host) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !played.current) {
            played.current = true;
            play();
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.4 },
    );
    io.observe(host);
    return () => io.disconnect();
  }, [play]);

  return (
    <section className={styles.live} id="live" aria-labelledby="live-title">
      <header className="section-head">
        <span className="section-eyebrow">Live</span>
        <h2 id="live-title" className="section-title">
          Memory that types back.
        </h2>
      </header>
      <div className={styles.terminal} data-terminal>
        <div className={styles.chrome}>
          <span className={`${styles.dot} ${styles.red}`} />
          <span className={`${styles.dot} ${styles.yellow}`} />
          <span className={`${styles.dot} ${styles.green}`} />
          <span className={styles.title}>agentmemory@localhost:3111</span>
        </div>
        <pre className={styles.body}>
          <code ref={termRef} />
        </pre>
        <div className={styles.foot}>
          <button
            className="btn btn--ghost btn--small"
            onClick={() => {
              played.current = true;
              play();
            }}
          >
            Replay
          </button>
          <span className={styles.status}>{status}</span>
        </div>
      </div>
    </section>
  );
}
