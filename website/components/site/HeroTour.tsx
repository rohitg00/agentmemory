"use client";

import { useEffect, useRef, useState } from "react";
import { VIEWER } from "@/lib/rest";
import s from "./HeroTour.module.css";

export function HeroTour() {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setStill(query.matches);
      if (query.matches) video.pause();
      else void video.play().catch(() => {});
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

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
          autoPlay
          controls={still}
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
