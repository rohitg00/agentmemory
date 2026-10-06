import { FEATURED, QUOTES } from "@/lib/site";
import { FEATURED_LOGOS } from "@/lib/rest";
import { Reveal } from "./client";
import s from "./InTheWild.module.css";

export function InTheWild() {
  return (
    <section id="wild" className="section" aria-labelledby="wild-title">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">In the wild</span>
          <h2 id="wild-title">Said by people who use it.</h2>
          <p>Every quote links to where it was said.</p>
        </div>

        <ul className={s.quotes}>
          {QUOTES.map((q, i) => (
            <Reveal as="li" key={q.name} delay={i * 80} className={s.quote}>
              <figure>
                <blockquote>
                  <p>{q.quote}</p>
                </blockquote>
                <figcaption>
                  <span className={s.who}>{q.name}</span>
                  <span className="mono">{q.context}</span>
                  <a className="src" href={q.href} target="_blank" rel="noreferrer">
                    source
                  </a>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Featured() {
  return (
    <section className={s.featuredStrip} aria-label="Featured in">
      <div className={`wrap ${s.featured}`}>
        <span className={`mono ${s.featuredHead}`}>Featured in</span>
        <ul className={s.outlets}>
          {FEATURED.map((f, i) => {
            const logo = FEATURED_LOGOS[f.name];
            const badge = "badge" in f ? f.badge : undefined;
            if (badge) {
              return (
                <Reveal as="li" key={f.name} delay={i * 60}>
                  <a className={`${s.outlet} ${s.badgeOutlet}`} href={f.href} target="_blank" rel="noopener noreferrer">
                    <img src={badge.light} alt={badge.alt} width={250} height={54} className="theme-light-only" loading="lazy" decoding="async" />
                    <img src={badge.dark} alt="" aria-hidden="true" width={250} height={54} className="theme-dark-only" loading="lazy" decoding="async" />
                  </a>
                </Reveal>
              );
            }
            return (
              <Reveal as="li" key={f.name} delay={i * 60}>
                <a className={s.outlet} href={f.href} target="_blank" rel="noreferrer">
                  {logo && (
                    <img
                      src={logo.src}
                      alt=""
                      width={logo.wide ? 84 : 24}
                      height={logo.wide ? 20 : 24}
                      className={logo.wide ? s.markWide : s.mark}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  <span className={s.outletText}>
                    <span className={logo?.wide ? "sr-only" : s.outletName}>{f.name}</span>
                    <span className="mono">{f.sub}</span>
                  </span>
                </a>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
