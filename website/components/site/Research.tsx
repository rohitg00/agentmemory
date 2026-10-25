import { RESEARCH, src } from "@/lib/site";
import { Reveal } from "./client";
import s from "./Research.module.css";

export function Research() {
  return (
    <section id="research" className="section" aria-labelledby="research-title">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Research</span>
          <h2 id="research-title">Cited in agent memory research.</h2>
          <p>
            Researchers designing memory for AI agents cite{" "}
            <a className={s.inline} href={src.wiki} target="_blank" rel="noreferrer">
              LLM Wiki v2
            </a>
            , the design agentmemory implements, and agentmemory itself. Every entry links to the paper.
          </p>
        </div>

        <div className={s.head} aria-hidden="true">
          <span>Published</span>
          <span>Paper</span>
          <span>What it says</span>
        </div>
        <ol className={s.papers}>
          {RESEARCH.map((p, i) => (
            <Reveal as="li" key={p.href} delay={i * 60} className={s.paper}>
              <p className={`mono ${s.meta}`}>
                <span>{p.date}</span>
                <span>{p.venue}</span>
              </p>
              <div className={s.work}>
                <h3>
                  <a href={p.href} target="_blank" rel="noreferrer">
                    {p.title}
                  </a>
                </h3>
                <p className={s.authors}>{p.authors}</p>
              </div>
              <figure className={s.said}>
                {p.quote ? (
                  <blockquote>
                    <p>{p.quote}</p>
                  </blockquote>
                ) : (
                  <p className={s.note}>{p.note}</p>
                )}
                <figcaption className="mono">on {p.cites}</figcaption>
              </figure>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
