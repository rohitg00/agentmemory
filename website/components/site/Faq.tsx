import { FAQ } from "@/lib/site";
import s from "./Faq.module.css";

export function Faq() {
  const ld = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return (
    <section id="faq" className="section" aria-labelledby="faq-title">
      <div className={`wrap ${s.grid}`}>
        <div className="section-head">
          <span className="eyebrow">FAQ</span>
          <h2 id="faq-title">Questions people ask first.</h2>
        </div>
        <div className={s.list}>
          {FAQ.map((f, i) => (
            <details key={f.q} className={s.item} open={i === 0}>
              <summary>
                <span>{f.q}</span>
                <span className={s.mark} aria-hidden="true" />
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
    </section>
  );
}
