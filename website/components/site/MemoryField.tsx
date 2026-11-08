"use client";

import { useEffect, useRef } from "react";
import s from "./MemoryField.module.css";

interface Dot {
  x: number;
  y: number;
  c: number;
  born: number;
  phase: number;
}

const TOPICS = [
  { name: "auth", x: 0.27, y: 0.3 },
  { name: "database", x: 0.73, y: 0.27 },
  { name: "api", x: 0.52, y: 0.55 },
  { name: "tests", x: 0.24, y: 0.76 },
  { name: "deploy", x: 0.76, y: 0.75 },
];

const QUERIES = [
  { text: "why does login fail after 15 min?", topic: 0 },
  { text: "which migration touched users?", topic: 1 },
  { text: "how do we run the e2e suite?", topic: 3 },
  { text: "what changed in the deploy script?", topic: 4 },
  { text: "where is rate limiting enforced?", topic: 2 },
];

const PER_TOPIC = 46;
const K = 5;

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number) {
  const u = Math.max(r(), 1e-6);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

function build(): Dot[] {
  const r = rng(20260930);
  const dots: Dot[] = [];
  for (let c = 0; c < TOPICS.length; c++) {
    for (let i = 0; i < PER_TOPIC; i++) {
      dots.push({
        x: TOPICS[c].x + gauss(r) * 0.065,
        y: TOPICS[c].y + gauss(r) * 0.06,
        c,
        born: 0,
        phase: r() * Math.PI * 2,
      });
    }
  }
  const order = dots.map((_, i) => i).sort(() => r() - 0.5);
  order.forEach((idx, n) => {
    dots[idx].born = n * 7;
  });
  return dots;
}

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

const FADE_IN_MS = 260;
const FADE_OUT_MS = 420;

function queryFade(elapsed: number, total: number): number {
  if (elapsed < FADE_IN_MS) return easeOut(elapsed / FADE_IN_MS);
  if (elapsed > total - FADE_OUT_MS) return 1 - easeOut((elapsed - (total - FADE_OUT_MS)) / FADE_OUT_MS);
  return 1;
}

export function MemoryField() {
  const wrap = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const host = wrap.current;
    const cv = canvas.current;
    if (!host || !cv) return;
    const context = cv.getContext("2d");
    if (!context) return;
    const ctx: CanvasRenderingContext2D = context;

    const dots = build();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colors = { accent: "#ff7a17", ink: "#0a0a0a", muted: "#6b6b6b", dot: "rgba(10,10,10,.16)", bg: "#fafafa", line: "#e6e6e6" };
    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      colors.ink = cs.getPropertyValue("--ink").trim() || colors.ink;
      colors.accent = cs.getPropertyValue("--accent").trim() || colors.accent;
      colors.muted = cs.getPropertyValue("--muted").trim() || colors.muted;
      colors.dot = cs.getPropertyValue("--dot").trim() || colors.dot;
      colors.bg = cs.getPropertyValue("--surface").trim() || colors.bg;
      colors.line = cs.getPropertyValue("--line-2").trim() || colors.line;
    };
    readColors();

    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      const rect = host.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      if (reduce || !running) draw(performance.now());
    };

    const mono = getComputedStyle(document.body).getPropertyValue("--font-mono").trim() || "ui-monospace";
    const font = (px: number, weight = 400) => `${weight} ${px}px ${mono}, ui-monospace, monospace`;

    const start = performance.now();
    let pointer: { x: number; y: number } | null = null;
    let queryIndex = 0;
    let queryStart = start + 2100;
    const QUERY_MS = 4200;
    let running = false;
    let raf = 0;

    const px = (d: Dot) => d.x * w;
    const py = (d: Dot) => d.y * h;

    const nearest = (qx: number, qy: number, topic: number | null) => {
      const pool = topic === null ? dots : dots.filter((d) => d.c === topic);
      return pool
        .map((d) => ({ d, dist: (px(d) - qx) ** 2 + (py(d) - qy) ** 2 }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, K)
        .map((e) => e.d);
    };

    const roundRect = (x: number, y: number, rw: number, rh: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + rw, y, x + rw, y + rh, r);
      ctx.arcTo(x + rw, y + rh, x, y + rh, r);
      ctx.arcTo(x, y + rh, x, y, r);
      ctx.arcTo(x, y, x + rw, y, r);
      ctx.closePath();
    };

    const label = (lines: string[], x: number, y: number, alpha: number) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = font(12);
      const widths = lines.map((l) => ctx.measureText(l).width);
      const bw = Math.max(...widths) + 20;
      const bh = lines.length * 17 + 12;
      const bx = Math.min(Math.max(8, x - bw / 2), w - bw - 8);
      const by = Math.min(Math.max(8, y), h - bh - 8);
      roundRect(bx, by, bw, bh, 5);
      ctx.fillStyle = colors.bg;
      ctx.fill();
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1;
      ctx.stroke();
      lines.forEach((l, i) => {
        ctx.fillStyle = i === 0 ? colors.ink : colors.muted;
        ctx.fillText(l, bx + 10, by + 20 + i * 17);
      });
      ctx.restore();
    };

    function draw(now: number) {
      const t = reduce ? 1e9 : now - start;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      let hits: Dot[] = [];
      let qx = 0;
      let qy = 0;
      let qAlpha = 0;
      let qText = "";
      if (pointer) {
        qx = pointer.x;
        qy = pointer.y;
        hits = nearest(qx, qy, null);
        qAlpha = 1;
        qText = "recall: nearest memories";
      } else {
        const q = QUERIES[queryIndex % QUERIES.length];
        const elapsed = reduce ? 1200 : now - queryStart;
        if (elapsed >= 0 && elapsed < QUERY_MS) {
          const topic = TOPICS[q.topic];
          qx = (topic.x + (topic.x < 0.5 ? 0.17 : -0.17)) * w;
          qy = (topic.y + (topic.y < 0.5 ? 0.12 : -0.13)) * h;
          hits = nearest(topic.x * w, topic.y * h, q.topic);
          qAlpha = queryFade(elapsed, QUERY_MS);
          qText = `recall: "${q.text}"`;
        } else if (!reduce && elapsed >= QUERY_MS) {
          queryIndex += 1;
          queryStart = now + 900;
        }
      }
      const hitSet = new Set(hits);

      for (let i = 0; i < TOPICS.length; i++) {
        const tp = TOPICS[i];
        const shown = easeOut((t - 300 - i * 120) / 600);
        if (shown <= 0) continue;
        ctx.save();
        ctx.globalAlpha = shown;
        ctx.font = font(12, 500);
        ctx.fillStyle = colors.muted;
        const text = `${tp.name} · ${PER_TOPIC}`;
        const tw = ctx.measureText(text).width;
        const lx = Math.min(Math.max(8, tp.x * w - tw / 2), w - tw - 8);
        const ly = tp.y < 0.5 ? tp.y * h - 0.16 * h : tp.y * h + 0.17 * h;
        ctx.fillText(text, lx, Math.min(Math.max(16, ly), h - 8));
        ctx.restore();
      }

      if (qAlpha > 0) {
        ctx.save();
        ctx.strokeStyle = colors.accent;
        ctx.lineWidth = 1;
        for (const d of hits) {
          ctx.globalAlpha = 0.55 * qAlpha;
          ctx.beginPath();
          ctx.moveTo(qx, qy);
          ctx.lineTo(px(d), py(d));
          ctx.stroke();
        }
        ctx.globalAlpha = qAlpha;
        ctx.fillStyle = colors.accent;
        ctx.beginPath();
        ctx.arc(qx, qy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(qx, qy, 9, 0, Math.PI * 2);
        ctx.globalAlpha = 0.25 * qAlpha;
        ctx.stroke();
        ctx.restore();
      }

      for (const d of dots) {
        const life = easeOut((t - d.born) / 520);
        if (life <= 0) continue;
        const jitter = reduce ? 0 : Math.sin(now / 1400 + d.phase) * 0.7;
        const x = px(d) + jitter - (1 - life) * 14;
        const y = py(d) + Math.cos(now / 1700 + d.phase) * (reduce ? 0 : 0.7);
        const hit = hitSet.has(d);
        ctx.globalAlpha = life * (hit ? 1 : 0.42 * (1 - 0.4 * qAlpha));
        ctx.fillStyle = hit ? colors.accent : colors.muted;
        ctx.beginPath();
        ctx.arc(x, y, hit ? 3.6 : 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (qAlpha > 0) {
        const below = qy < h * 0.5;
        label([qText, `${hits.length} memories → next session`], qx, below ? qy + 16 : qy - 62, qAlpha);
      }
    }

    const loop = (now: number) => {
      draw(now);
      raf = requestAnimationFrame(loop);
    };

    const play = () => {
      if (running || reduce) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const pause = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? play() : pause()));
    io.observe(host);

    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const onMove = (e: PointerEvent) => {
      const rect = cv.getBoundingClientRect();
      pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (reduce) draw(performance.now());
    };
    const onLeave = () => {
      pointer = null;
      queryStart = performance.now() + 600;
      if (reduce) draw(performance.now());
    };
    if (fine) {
      cv.addEventListener("pointermove", onMove);
      cv.addEventListener("pointerleave", onLeave);
    }

    const onTheme = () => {
      requestAnimationFrame(() => {
        readColors();
        draw(performance.now());
      });
    };
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", onTheme);
    window.addEventListener("am-theme", onTheme);
    const onVis = () => (document.hidden ? pause() : play());
    document.addEventListener("visibilitychange", onVis);

    if (reduce) draw(performance.now());

    return () => {
      pause();
      ro.disconnect();
      io.disconnect();
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerleave", onLeave);
      mq.removeEventListener("change", onTheme);
      window.removeEventListener("am-theme", onTheme);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <div className={s.panel}>
      <div className={s.head}>
        <span className="mono">local store · your machine</span>
        <span className="mono">{TOPICS.length * PER_TOPIC} observations · {TOPICS.length} topics</span>
      </div>
      <div ref={wrap} className={s.field}>
        <canvas ref={canvas} role="img" aria-label="Observations from past sessions cluster into topics; a recall query connects to the five most relevant memories and sends them to the next session." />
      </div>
      <div className={s.foot}>
        <span className="mono">each dot is one captured tool call</span>
        <span className={`mono ${s.hint}`}>move your pointer to recall</span>
      </div>
    </div>
  );
}
