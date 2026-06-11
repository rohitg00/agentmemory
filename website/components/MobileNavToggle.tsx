"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatCompact } from "@/lib/format";
import styles from "./MobileNavToggle.module.css";

interface Section {
  href: string;
  label: string;
}

export function MobileNavToggle({
  sections,
  stars,
}: {
  sections: Section[];
  stars: number;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      toggleRef.current?.focus();
    };
  }, [open]);

  // The parent <header> uses `backdrop-filter`, which establishes a containing
  // block for fixed descendants — that would clip the sheet to the header
  // strip. Portal it to <body> so `position: fixed; inset: 0` covers the
  // viewport instead.
  const sheet = (
    <div
      className={`${styles.sheet} ${open ? styles.sheetOpen : ""}`}
      aria-hidden={!open}
      inert={!open}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <nav className={styles.panel} aria-label="Site navigation">
        <ul className={styles.list}>
          {sections.map((s) => (
            <li key={s.href}>
              <a href={s.href} onClick={() => setOpen(false)}>
                {s.label}
              </a>
            </li>
          ))}
        </ul>
        <div className={styles.foot}>
          <a
            href="https://github.com/rohitg00/agentmemory"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            GITHUB · {formatCompact(stars)}★
          </a>
          <a
            href="https://www.npmjs.com/package/@agentmemory/agentmemory"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            NPM
          </a>
          <a
            href="https://github.com/rohitg00/agentmemory/blob/main/CHANGELOG.md"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            CHANGELOG
          </a>
        </div>
      </nav>
    </div>
  );

  return (
    <>
      <button
        className={styles.hamburger}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`${styles.bar} ${open ? styles.bar1 : ""}`} />
        <span className={`${styles.bar} ${open ? styles.bar2 : ""}`} />
        <span className={`${styles.bar} ${open ? styles.bar3 : ""}`} />
      </button>

      {mounted ? createPortal(sheet, document.body) : null}
    </>
  );
}
