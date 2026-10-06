"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export function CopyButton({
  text,
  label,
  className,
  children,
  labels,
}: {
  text: string;
  label: string;
  className?: string;
  children?: ReactNode;
  labels?: { idle: string; done: string };
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      data-copied={copied || undefined}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
    >
      {children}
      {labels ? (
        <span className="copy-label" aria-live="polite">
          {copied ? labels.done : labels.idle}
        </span>
      ) : (
        <span className="copy-state mono" aria-live="polite">
          {copied ? "copied" : "copy"}
        </span>
      )}
    </button>
  );
}

export function Reveal({
  children,
  delay = 0,
  as: Tag = "div",
  className,
}: {
  children: ReactNode;
  delay?: number;
  as?: "div" | "li" | "section" | "article";
  className?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add("is-in");
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const style = { "--d": `${delay}ms` } as CSSProperties;
  return (
    <Tag ref={ref as never} className={`reveal${className ? ` ${className}` : ""}`} style={style}>
      {children}
    </Tag>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const explicit = document.documentElement.dataset.theme as "light" | "dark" | undefined;
    const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(explicit ?? system);
  }, []);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className={className}
      aria-label={`Switch to ${next} theme`}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("am-theme", next);
        } catch {}
        setTheme(next);
        window.dispatchEvent(new Event("am-theme"));
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5Z" fill="currentColor" />
      </svg>
    </button>
  );
}

export function useScrollProgress<T extends HTMLElement>(steps = 0) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const items = Array.from(el.querySelectorAll<HTMLElement>("[data-a]")).map((node) => {
      const ds = node.dataset;
      return {
        node,
        a: Number(ds.a),
        b: Number(ds.b),
        a2: ds.a2 === undefined ? null : Number(ds.a2),
        b2: ds.b2 === undefined ? null : Number(ds.b2),
        dim: ds.dim === undefined ? 1 : Number(ds.dim),
        lift: ds.lift !== undefined,
        last: "",
      };
    });
    const rail = el.querySelector<HTMLElement>("[data-rail]");
    const paint = (p: number) => {
      for (const it of items) {
        const t = clamp((p - it.a) / (it.b - it.a));
        const u = it.a2 === null || it.b2 === null ? 0 : clamp((p - it.a2) / (it.b2 - it.a2));
        const opacity = t * (1 - it.dim * u);
        const transform = it.lift
          ? `translateY(${((1 - t) * 14).toFixed(2)}px) scale(${(0.97 + 0.03 * t).toFixed(4)})`
          : `translateY(${((1 - t) * 8).toFixed(2)}px)`;
        const key = `${opacity.toFixed(3)}|${transform}`;
        if (key === it.last) continue;
        it.last = key;
        it.node.style.opacity = opacity.toFixed(3);
        it.node.style.transform = transform;
      }
      if (rail) rail.style.transform = `scaleY(${p.toFixed(4)})`;
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.dataset.step = "all";
      paint(1);
      return;
    }
    let frame = 0;
    let visible = false;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      const p = span > 0 ? clamp(-rect.top / span) : 1;
      paint(p);
      if (steps > 0) {
        const step = String(Math.min(steps - 1, Math.floor(p * steps)));
        if (el.dataset.step !== step) el.dataset.step = step;
      }
    };
    const onScroll = () => {
      if (visible && !frame) frame = requestAnimationFrame(update);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) onScroll();
    });
    io.observe(el);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [steps]);
  return ref;
}
