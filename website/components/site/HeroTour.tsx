"use client";

import { useEffect, useRef, useState } from "react";
import { VIEWER } from "@/lib/rest";
import s from "./HeroTour.module.css";

export function HeroTour() {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [still, setStill] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setStill(query.matches);
      if (query.matches) video.pause();
      else void video.play().catch(() => {});
    };
    const sync = () => setPlaying(!video.paused);
    setReady(true);
    apply();
    video.addEventListener("play", sync);
    video.addEventListener("pause", sync);
    query.addEventListener("change", apply);
    return () => {
      video.removeEventListener("play", sync);
      video.removeEventListener("pause", sync);
      query.removeEventListener("change", apply);
    };
  }, []);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  };

  return (
    <figure className={s.tour}>
      <div className={s.frame}>
        <div className={s.chrome}>
          <div className={s.dots} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span className={s.address}>localhost:3113</span>
          <span className={s.recording}>Recorded tour</span>
          {ready && !still && (
            <button type="button" className={s.toggle} onClick={toggle}>
              {playing ? "Pause" : "Play"}
            </button>
          )}
        </div>
        <video
          ref={ref}
          className={s.shot}
          src={VIEWER.video}
          poster={VIEWER.poster}
          width={VIEWER.width}
          height={VIEWER.height}
          aria-label={VIEWER.alt}
          muted
          loop
          playsInline
          controls={!ready || still}
          preload="metadata"
        />
      </div>
      <figcaption className={s.caption}>
        <span className={s.title}>See what your agents remember.</span>
        <ul className={`mono ${s.features}`} aria-label="Viewer features">
          {VIEWER.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
