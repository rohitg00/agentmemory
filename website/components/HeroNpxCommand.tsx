"use client";

import { useState } from "react";
import styles from "./HeroNpxCommand.module.css";

const CMD = "npx @agentmemory/agentmemory";

export function HeroNpxCommand() {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(CMD);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — keep button visible */
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      className={`${styles.cmd} ${copied ? styles.copied : ""}`}
      aria-label="Copy install command"
    >
      <span className={styles.prompt}>$</span>
      <span className={styles.text}>{CMD}</span>
      <span className={styles.hint}>{copied ? "COPIED" : "CLICK TO COPY"}</span>
    </button>
  );
}
