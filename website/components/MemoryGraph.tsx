"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./MemoryGraph.module.css";

// Ambient hero backdrop: a quiet dither field of drifting dots.
// Every dot stays under 0.13 alpha; prefers-reduced-motion renders a
// single static frame instead of animating.
export function MemoryGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [running, setRunning] = useState(true);
  const railRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let localRunning = running && !reduceMotion;
    let rafId = 0;
    let t = 0;

    const size = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const spacing = 26;
      const cols = Math.ceil(w / spacing) + 2;
      const rows = Math.ceil(h / spacing) + 2;

      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const x = gx * spacing;
          const y = gy * spacing;
          const wave =
            Math.sin(x * 0.011 + t * 0.5) +
            Math.sin(y * 0.014 - t * 0.32) +
            Math.sin((x + y) * 0.006 + t * 0.21);
          const a = Math.max(0, wave / 3) * 0.12;
          if (a < 0.012) continue;
          const dx = Math.sin(t * 0.12 + y * 0.02) * 5;
          const dy = Math.cos(t * 0.09 + x * 0.015) * 3;
          ctx.fillStyle = `rgba(255, 255, 255, ${a.toFixed(3)})`;
          ctx.fillRect(x + dx, y + dy, 1.5, 1.5);
        }
      }

      t += 0.016;
    };

    const tick = () => {
      if (!localRunning) return;
      draw();
      rafId = requestAnimationFrame(tick);
    };

    const onResize = () => {
      size();
      draw();
    };

    size();
    draw();
    if (localRunning) rafId = requestAnimationFrame(tick);
    window.addEventListener("resize", onResize);

    const updateRail = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const pct = max <= 0 ? 0 : Math.min(1, h.scrollTop / max);
      if (railRef.current) railRef.current.style.width = `${pct * 100}%`;
    };
    updateRail();
    window.addEventListener("scroll", updateRail, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", updateRail);
      localRunning = false;
    };
  }, [running]);

  return (
    <>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden />
      <div className={styles.rail} aria-hidden>
        <span ref={railRef} />
      </div>
    </>
  );
}
