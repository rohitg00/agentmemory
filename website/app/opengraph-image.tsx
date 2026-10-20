import { ImageResponse } from "next/og";
import { compact, getProjectMeta } from "@/lib/meta";
import { LONGMEMEVAL } from "@/lib/site";

export const alt = "agentmemory: memory that outlives the session";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0a0a0a";
const MUTED = "#6b6b6b";
const LINE = "#e2e2e2";
const BG = "#fafafa";

function cluster() {
  let a = 20260930;
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const centers = [
    [90, 90],
    [250, 70],
    [170, 190],
    [80, 290],
    [260, 280],
  ];
  const dots: Array<[number, number, boolean]> = [];
  centers.forEach(([cx, cy], c) => {
    for (let i = 0; i < 16; i++) {
      const ang = r() * Math.PI * 2;
      const rad = Math.sqrt(r()) * 46;
      dots.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad, c === 0 && i < 5]);
    }
  });
  return dots;
}

export default function Image() {
  const meta = getProjectMeta();
  const dots = cluster();
  const query: [number, number] = [190, 120];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: BG,
          color: INK,
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg width="44" height="44" viewBox="0 0 24 24">
              <rect x="1" y="1" width="22" height="22" rx="6" fill={INK} />
              <rect x="6" y="6.5" width="12" height="2.4" rx="1.2" fill={BG} />
              <rect x="6" y="10.4" width="12" height="2.4" rx="1.2" fill={BG} opacity="0.62" />
              <rect x="6" y="14.3" width="12" height="2.4" rx="1.2" fill={BG} opacity="0.4" />
              <rect x="6" y="18.2" width="12" height="1.6" rx="0.8" fill={BG} opacity="0.22" />
            </svg>
            <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: -0.5 }}>agentmemory</div>
          </div>
          <div style={{ display: "flex", fontSize: 20, color: MUTED, fontFamily: "monospace" }}>
            v{meta.version} · Apache-2.0
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 40 }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 650, letterSpacing: -3.5, lineHeight: 1.02, maxWidth: 680 }}>
            Memory that outlives the session.
          </div>
          <svg width="340" height="360" viewBox="0 0 340 360">
            {dots
              .filter((d) => d[2])
              .map((d, i) => (
                <line key={`l${i}`} x1={query[0]} y1={query[1]} x2={d[0]} y2={d[1]} stroke={INK} strokeWidth="1.5" opacity="0.6" />
              ))}
            {dots.map((d, i) => (
              <circle key={i} cx={d[0]} cy={d[1]} r={d[2] ? 6 : 4} fill={d[2] ? INK : MUTED} opacity={d[2] ? 1 : 0.4} />
            ))}
            <circle cx={query[0]} cy={query[1]} r="8" fill={INK} />
            <circle cx={query[0]} cy={query[1]} r="16" fill="none" stroke={INK} strokeWidth="1.5" opacity="0.3" />
          </svg>
        </div>

        <div
          style={{
            display: "flex",
            gap: 48,
            paddingTop: 28,
            borderTop: `1px solid ${LINE}`,
            fontFamily: "monospace",
            fontSize: 22,
            color: MUTED,
          }}
        >
          <div style={{ display: "flex", gap: 10 }}>
            <span style={{ color: INK }}>{LONGMEMEVAL.hybrid.r5}%</span>
            <span>recall@5 LongMemEval-S</span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <span style={{ color: INK }}>{compact(meta.stars)}</span>
            <span>GitHub stars</span>
          </div>
          <div style={{ display: "flex", marginLeft: "auto", color: INK }}>agent-memory.dev</div>
        </div>
      </div>
    ),
    size,
  );
}
