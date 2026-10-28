import type { Metadata } from "next";
import Link from "next/link";
import { DocPage, Prose } from "@/components/site/Doc";
import { CHECKED_ON, COMPETITORS } from "@/lib/compare";
import s from "./vs.module.css";

export const metadata: Metadata = {
  title: "Compare",
  description: "How agentmemory compares with other memory tools for AI agents, with sources for every fact.",
  alternates: { canonical: "/vs" },
};

export default function Page() {
  return (
    <DocPage
      eyebrow="Compare"
      title="agentmemory compared"
      lede="Side by side with other memory tools for AI agents. Every fact links to its source, and each page says when to choose the other tool."
    >
      <Prose>
        <ul className={s.index}>
          {COMPETITORS.map((c) => (
            <li key={c.slug}>
              <Link href={`/vs/${c.slug}`} className={s.card}>
                <span className={s.cardTitle}>agentmemory vs {c.name}</span>
                <span className={s.cardSub}>{c.tagline}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className={s.checked}>Facts checked on {CHECKED_ON}.</p>
      </Prose>
    </DocPage>
  );
}
