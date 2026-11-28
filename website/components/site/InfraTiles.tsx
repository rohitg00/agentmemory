import Link from "next/link";
import type { CSSProperties } from "react";

import { Reveal } from "./client";
import s from "./InfraTiles.module.css";

const HITS = [
  { title: "Rotate refresh tokens on every use", layer: "memory", score: "0.91" },
  { title: "Edit src/auth/refresh.ts", layer: "observation", score: "0.84" },
  { title: "Refresh fails after a clock skew", layer: "lesson", score: "0.77" },
  { title: "Run auth tests before pushing", layer: "memory", score: "0.62" },
];

function Results() {
  return (
    <div className={s.panel} role="group" aria-label="Example: keyword search for auth refresh">
      <div className={s.panelHead}>
        <span className="mono">memory_smart_search</span>
        <span className="mono">BM25 · no key</span>
      </div>
      <div className={`mono ${s.query}`}>auth refresh</div>
      <ol className={s.hits}>
        {HITS.map((hit, i) => (
          <li key={hit.title} className={s.hit} style={{ "--rd": `${250 + i * 70}ms` } as CSSProperties}>
            <span className={s.hitTitle}>{hit.title}</span>
            <span className={`mono ${s.hitLayer}`}>{hit.layer}</span>
            <span className={`mono ${s.hitScore}`}>{hit.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const REQUESTS = [
  { line: "POST 127.0.0.1:3111/agentmemory/mcp", status: "401", note: "no token", ok: false },
  { line: "POST 127.0.0.1:3111/agentmemory/mcp", status: "200", note: "Bearer secret", ok: true },
  { line: "POST .../mcp  Origin: evil.example", status: "403", note: "origin not allowed", ok: false },
];

function Boundary() {
  return (
    <div className={s.panel} role="group" aria-label="Example: requests to the local server">
      <div className={s.panelHead}>
        <span className="mono">bind 127.0.0.1</span>
        <span className="mono">auth on</span>
      </div>
      <ul className={s.reqs}>
        {REQUESTS.map((req, i) => (
          <li key={i} className={s.req} style={{ "--rd": `${250 + i * 90}ms` } as CSSProperties}>
            <span className={`mono ${s.reqLine}`}>{req.line}</span>
            <span className={`mono ${req.ok ? s.reqOk : s.reqNo}`}>{req.status}</span>
            <span className={`mono ${s.reqNote}`}>{req.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ROWS = [0.92, 0.7, 0.84, 0.6, 0.88, 0.74, 0.66, 0.8];

function Compaction() {
  return (
    <div className={s.ctx} aria-hidden="true">
      <div className={s.ctxHead}>
        <span className="mono">context window</span>
        <span className={`mono ${s.ctxFull}`}>full</span>
      </div>
      <div className={s.ctxMem}>
        <span className="mono">agentmemory</span>
        <span className={`mono ${s.ctxTag}`}>PreCompact · re-injected</span>
      </div>
      <div className={s.ctxRows}>
        {ROWS.map((w, i) => (
          <span key={i} className={s.ctxRow} style={{ width: `${w * 100}%`, "--rd": `${200 + i * 110}ms` } as CSSProperties} />
        ))}
        <span className={`mono ${s.ctxSummary}`}>compacted summary</span>
      </div>
    </div>
  );
}

export function InfraTiles() {
  return (
    <section className={s.section} aria-label="How agentmemory runs">
      <div className={`wrap ${s.row}`}>
        <Reveal className={s.tile}>
          <h3 className="mono">Keyless recall</h3>
          <p>Keyword search works without an API key. Enable local embeddings to add semantic retrieval.</p>
          <div className={s.art}>
            <Results />
          </div>
          <a className="src" href="/benchmarks" target="_blank" rel="noreferrer">
            retrieval evaluation
          </a>
        </Reveal>
        <Reveal className={s.tile} delay={80}>
          <h3 className="mono">Isolated on your machine</h3>
          <p>Binds to 127.0.0.1 with auth on by default. Memory text stays local unless you configure a remote service.</p>
          <div className={s.art}>
            <Boundary />
          </div>
          <Link className="src" href="/security">
            security model
          </Link>
        </Reveal>
        <Reveal className={s.tile} delay={160}>
          <h3 className="mono">Survives compaction</h3>
          <p>On supported integrations, enable the PreCompact hook to restore memory context around compaction.</p>
          <div className={s.art}>
            <Compaction />
          </div>
          <Link className="src" href="/how-it-works#value">
            what your agent gets
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
