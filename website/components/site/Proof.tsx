import Link from "next/link";
import { AGENTS, src } from "@/lib/site";
import { compact, getLiveProjectMeta } from "@/lib/meta";
import { Reveal } from "./client";
import s from "./Proof.module.css";

export async function Proof() {
  const m = await getLiveProjectMeta();
  const items = [
    { value: compact(m.stars), label: "GitHub stars", href: src.stars },
    { value: compact(m.npmAllTime), label: "npm installs, all time", href: src.npm },
    { value: String(m.contributors), label: "contributors", href: src.contributors },
    { value: String(AGENTS.length), label: "coding agents supported", href: "/agents" },
  ];
  return (
    <section className={s.strip} aria-label="Project numbers">
      <ul className={`wrap ${s.list}`}>
        {items.map((it, i) => (
          <Reveal as="li" key={it.label} delay={i * 60} className={s.item}>
            {it.href.startsWith("http") ? (
              <a href={it.href} target="_blank" rel="noreferrer">
                <span className={s.value}>{it.value}</span>
                <span className={`mono ${s.label}`}>{it.label}</span>
              </a>
            ) : (
              <Link href={it.href}>
                <span className={s.value}>{it.value}</span>
                <span className={`mono ${s.label}`}>{it.label}</span>
              </Link>
            )}
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
