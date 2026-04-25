"use client";

import { useState } from "react";
import styles from "./Install.module.css";
import { AgentInstall } from "./AgentInstall";

interface Cmd {
  label: string;
  cmd: string;
  hint: string;
}

const SIMPLE: Cmd[] = [
  {
    label: "1. START THE MEMORY SERVER",
    cmd: "npx @agentmemory/agentmemory",
    hint: "RUNS ON :3111 · VIEWER ON :3113",
  },
  {
    label: "2. SEE SEMANTIC RECALL INSTANTLY",
    cmd: "npx @agentmemory/agentmemory demo",
    hint: "SEEDS 3 SESSIONS · PROVES HYBRID SEARCH WORKS",
  },
  {
    label: "3. OPEN THE LIVE VIEWER",
    cmd: "open http://localhost:3113",
    hint: "SESSIONS · MEMORIES · GRAPH · HEALTH",
  },
];

function CopyBox({ label, cmd, hint }: Cmd) {
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState(hint);

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setText("COPIED");
      setTimeout(() => {
        setCopied(false);
        setText(hint);
      }, 1600);
    } catch {
      setText("CLIPBOARD BLOCKED");
    }
  };

  return (
    <div className={styles.step}>
      <div className={styles.stepLabel}>{label}</div>
      <button
        className={`${styles.box} ${copied ? styles.boxCopied : ""}`}
        onClick={onClick}
      >
        <span className={styles.prompt}>$</span>
        <span className={styles.cmd}>{cmd}</span>
        <span className={styles.hint}>{text}</span>
      </button>
    </div>
  );
}

export function Install() {
  return (
    <section className={styles.install} id="install" aria-labelledby="install-title">
      <header className="section-head">
        <span className="section-eyebrow">SHIP IT</span>
        <h2 id="install-title" className="section-title">
          THREE COMMANDS.<br />ANY AGENT.
        </h2>
        <p className="section-lede">
          RUNS ON YOUR MACHINE. DATA STAYS LOCAL. BRING YOUR CLAUDE SUBSCRIPTION
          — OR POINT IT AT ANTHROPIC, GEMINI, MINIMAX, OR OPENROUTER.
        </p>
      </header>
      <div className={styles.cards}>
        {SIMPLE.map((c) => (
          <CopyBox key={c.cmd} {...c} />
        ))}
        <AgentInstall />
      </div>
      <div className={styles.cta}>
        <a
          className="btn btn--accent"
          href="https://github.com/rohitg00/agentmemory#quick-start"
          target="_blank"
          rel="noopener"
        >
          READ THE QUICKSTART
        </a>
        <a
          className="btn btn--ghost"
          href="https://www.npmjs.com/package/@agentmemory/agentmemory"
          target="_blank"
          rel="noopener"
        >
          NPM PACKAGE
        </a>
        <a
          className="btn btn--ghost"
          href="https://github.com/rohitg00/agentmemory/tree/main/integrations"
          target="_blank"
          rel="noopener"
        >
          INTEGRATIONS
        </a>
      </div>
    </section>
  );
}
