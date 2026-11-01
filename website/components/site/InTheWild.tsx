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

type Outlet = (typeof FEATURED)[number];

const shuffle = <T,>(items: readonly T[]) =>
  items
    .map((item) => ({ item, rank: Math.random() }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ item }) => item);

function mixed(): Outlet[] {
  const badges = shuffle(FEATURED.filter((f) => "badge" in f));
  const outlets = shuffle(FEATURED.filter((f) => !("badge" in f)));
  const [more, fewer] = badges.length >= outlets.length ? [badges, outlets] : [outlets, badges];
  return more.flatMap((f, i) => (fewer[i] ? [f, fewer[i]] : [f]));
}

function OutletCard({ f, copy }: { f: Outlet; copy: boolean }) {
  const badge = "badge" in f ? f.badge : undefined;
  const tabIndex = copy ? -1 : undefined;
  if (badge) {
    return (
      <a
        className={`${s.outlet} ${s.badgeOutlet}`}
        href={f.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={badge.alt}
        tabIndex={tabIndex}
      >
        <img src={badge.light} alt="" width={250} height={54} className="theme-light-only" decoding="async" />
        <img src={badge.dark} alt="" width={250} height={54} className="theme-dark-only" decoding="async" />
      </a>
    );
  }
  const logo = FEATURED_LOGOS[f.name];
  return (
    <a className={s.outlet} href={f.href} target="_blank" rel="noreferrer" tabIndex={tabIndex}>
      {logo && (
        <img
          src={logo.src}
          alt=""
          width={logo.wide ? 84 : 24}
          height={logo.wide ? 20 : 24}
          className={logo.wide ? s.markWide : s.mark}
          decoding="async"
        />
      )}
      <span className={s.outletText}>
        <span className={logo?.wide ? "sr-only" : s.outletName}>{f.name}</span>
        <span className="mono">{f.sub}</span>
      </span>
    </a>
  );
}

export function Featured() {
  const items = mixed();
  return (
    <section className={s.featuredStrip} aria-label="Featured in">
      <div className={`wrap ${s.featured}`}>
        <span className={`mono ${s.featuredHead}`}>Featured in</span>
        <div className={s.marquee}>
          <div className={s.track}>
            {[false, true].map((copy) => (
              <ul key={String(copy)} className={s.set} aria-hidden={copy || undefined}>
                {items.map((f) => (
                  <li key={f.name} className={s.item}>
                    <OutletCard f={f} copy={copy} />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
