"use client";

import { useEffect, useRef } from "react";

export function ScrollProgress() {
  const barRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const update = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const pct = max <= 0 ? 0 : Math.min(1, h.scrollTop / max);
      if (barRef.current) barRef.current.style.width = `${pct * 100}%`;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: 2,
        background: "transparent",
        zIndex: 200,
      }}
    >
      <span
        ref={barRef}
        style={{
          display: "block",
          height: "100%",
          width: 0,
          background: "rgba(255, 255, 255, 0.35)",
          transition: "width 80ms linear",
        }}
      />
    </div>
  );
}
