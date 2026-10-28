import type { CSSProperties } from "react";
import { src } from "@/lib/site";
import { Reveal } from "./client";
import s from "./InfraTiles.module.css";

function Gauge() {
  const r = 120;
  const cx = 150;
  const cy = 150;
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from);
    const a1 = Math.PI * (1 - to);
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy - r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy - r * Math.sin(a1);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const ticks = Array.from({ length: 11 }, (_, i) => i / 10);
  return (
    <svg viewBox="0 0 300 170" className={s.gauge} aria-hidden="true">
      <path d={arc(0, 1)} className={s.track} />
      {ticks.map((t) => {
        const a = Math.PI * (1 - t);
        const x0 = cx + (r - 8) * Math.cos(a);
        const y0 = cy - (r - 8) * Math.sin(a);
        const x1 = cx + (r - 16) * Math.cos(a);
        const y1 = cy - (r - 16) * Math.sin(a);
        return <line key={t} x1={x0} y1={y0} x2={x1} y2={y1} className={s.tick} />;
      })}
      <path d={arc(0, 0.28)} className={s.fill} pathLength={1} />
      <text x="150" y="128" textAnchor="middle" className={s.readout}>
        14 ms
      </text>
      <text x="30" y="166" className={s.scale}>
        0
      </text>
      <text x="270" y="166" className={s.scale} textAnchor="end">
        50 ms
      </text>
    </svg>
  );
}

function Isometric() {
  const iso = (x: number, y: number, z: number) => {
    const px = 150 + (x - y) * 0.866;
    const py = 120 + (x + y) * 0.5 - z;
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  };
  const cube = (x: number, y: number, z: number, w: number, d: number, h: number) => ({
    top: [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)].join(" "),
    left: [iso(x, y + d, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x, y + d, z + h)].join(" "),
    right: [iso(x + w, y, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x + w, y, z + h)].join(" "),
  });
  const outer = cube(-70, -70, -40, 140, 140, 120);
  const inner = cube(-28, -28, 0, 56, 56, 46);
  const drops = [
    [-28, -28],
    [28, -28],
    [-28, 28],
    [28, 28],
  ];
  return (
    <svg viewBox="0 0 300 250" className={s.iso} aria-hidden="true">
      <polygon points={outer.left} className={s.ghost} />
      <polygon points={outer.right} className={s.ghost} />
      <polygon points={outer.top} className={s.ghost} />
      {drops.map(([x, y]) => {
        const [x1, y1] = iso(x, y, 0).split(",");
        const [x2, y2] = iso(x, y, -40).split(",");
        return <line key={`${x}${y}`} x1={x1} y1={y1} x2={x2} y2={y2} className={s.drop} />;
      })}
      <g className={s.float}>
        <polygon points={inner.left} className={s.faceL} />
        <polygon points={inner.right} className={s.faceR} />
        <polygon points={inner.top} className={s.faceT} />
      </g>
      <text x="150" y="238" textAnchor="middle" className={s.isoLabel}>
        127.0.0.1 · your machine
      </text>
    </svg>
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
          <h3 className="mono">Recall in 14 ms</h3>
          <p>Median hybrid search over BM25, local vectors and the graph. No network round trip.</p>
          <div className={s.art}>
            <Gauge />
          </div>
          <code className={s.call}>
            memory_smart_search(&quot;auth refresh&quot;)<span className={s.caret} />
          </code>
          <a className="src" href={src.agentLife} target="_blank" rel="noreferrer">
            p50, coding-agent-life-v1 on v0.9.26
          </a>
        </Reveal>
        <Reveal className={s.tile} delay={80}>
          <h3 className="mono">Isolated on your machine</h3>
          <p>Binds to 127.0.0.1 with auth on by default. Nothing leaves unless you add a provider.</p>
          <div className={s.art}>
            <Isometric />
          </div>
          <a className="src" href="/security">
            security model
          </a>
        </Reveal>
        <Reveal className={s.tile} delay={160}>
          <h3 className="mono">Survives compaction</h3>
          <p>When your agent compacts its context, the PreCompact hook puts memory back before the next turn.</p>
          <div className={s.art}>
            <Compaction />
          </div>
          <a className="src" href="/#value">
            what your agent gets
          </a>
        </Reveal>
      </div>
    </section>
  );
}
