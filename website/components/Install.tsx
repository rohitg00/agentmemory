"use client";

import { useState } from "react";
import styles from "./Install.module.css";
import { AgentInstall } from "./AgentInstall";

interface Cmd {
  label: string;
  cmd: string;
  hint: string;
  hintUrl?: string;
}

const SIMPLE: Cmd[] = [
  {
    label: "1. Install once",
    cmd: "npm install -g @agentmemory/agentmemory",
    hint: "Puts `agentmemory` on your PATH · steps 2/3 need this",
  },
  {
    label: "2. Start the memory server",
    cmd: "agentmemory",
    hint: "Runs on :3111 · viewer on :3113",
  },
  {
    label: "3. Run the demo",
    cmd: "agentmemory demo",
    hint: "Seeds 3 sessions · shows hybrid recall on real data",
  },
];

const NPX_FALLBACK: Cmd = {
  label: "Zero-install path: npx",
  cmd: "npx @agentmemory/agentmemory",
  hint: "Replaces steps 1+2 · uses the npx cache · slower cold start",
  hintUrl: "https://github.com/rohitg00/agentmemory#quick-start",
};

function CopyBox({ label, cmd, hint, hintUrl }: Cmd) {
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
      {hintUrl && (
        <a
          className={styles.hintLink}
          href={hintUrl}
          target="_blank"
          rel="noopener"
        >
          Read the npx caveat ↗
        </a>
      )}
    </div>
  );
}

export function Install() {
  return (
    <section className={styles.install} id="install" aria-labelledby="install-title">
      <header className="section-head">
        <span className="section-eyebrow">Ship it</span>
        <h2 id="install-title" className="section-title">
          One install.<br />Any agent.
        </h2>
        <p className="section-lede">
          Runs on your machine. Data stays local. The CLI package (
          <code>@agentmemory/agentmemory</code>) runs the server; agents talk
          to it through the MCP package (<code>@agentmemory/mcp</code>).
          Capture and recall need no LLM key; add one for Anthropic, OpenAI,
          Gemini, MiniMax, or OpenRouter to activate consolidation, graph
          extraction, and LLM compression.
        </p>
      </header>
      <div className={styles.cards}>
        {SIMPLE.map((c) => (
          <CopyBox key={c.cmd} {...c} />
        ))}
        <CopyBox {...NPX_FALLBACK} />
        <AgentInstall />
      </div>
      <div className={styles.cta}>
        <a
          className="btn btn--sunset"
          href="https://github.com/rohitg00/agentmemory#quick-start"
          target="_blank"
          rel="noopener"
        >
          Read the quickstart
        </a>
        <a
          className="btn btn--ghost"
          href="https://www.npmjs.com/package/@agentmemory/agentmemory"
          target="_blank"
          rel="noopener"
        >
          npm package
        </a>
        <a
          className="btn btn--ghost"
          href="https://github.com/rohitg00/agentmemory/tree/main/integrations"
          target="_blank"
          rel="noopener"
        >
          Integrations
        </a>
      </div>
    </section>
  );
}
