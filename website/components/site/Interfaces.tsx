import { VIEWER } from "@/lib/rest";
import s from "./Interfaces.module.css";

export function Interfaces() {
  return (
    <section id="interfaces" className={`section ${s.section}`} aria-labelledby="interfaces-title">
      <div className="wrap">
        <div className={s.heading}>
          <div>
            <span className="eyebrow">The AgentMemory viewer</span>
            <h2 id="interfaces-title">See what your agents remember.</h2>
          </div>
          <p>
            Follow a session, explore connected memories and trace a lesson back to its source.
            Included with AgentMemory, right on your machine.
          </p>
        </div>

        <figure className={s.tour}>
          <div className={s.frame}>
            <div className={s.chrome}>
              <div className={s.dots} aria-hidden="true"><span /><span /><span /></div>
              <span className={s.address}>localhost:3113</span>
              <span className={s.recording}>Recorded tour</span>
            </div>
            <img
              src={VIEWER.img}
              alt={VIEWER.alt}
              width={VIEWER.width}
              height={VIEWER.height}
              className={s.shot}
              loading="lazy"
              decoding="async"
            />
          </div>
          <figcaption className={s.caption}>
            <ul aria-label="Viewer features">
              {VIEWER.features.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            <a className={s.expand} href={VIEWER.img} target="_blank" rel="noreferrer">
              Open full-size tour <span aria-hidden="true">↗</span>
            </a>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
