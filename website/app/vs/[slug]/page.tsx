import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { DocPage, Prose } from "@/components/site/Doc";
import { AGENTMEMORY, CHECKED_ON, COMPETITORS, ROWS, getCompetitor, type Fact } from "@/lib/compare";
import { REPO_URL } from "@/lib/site";
import s from "../vs.module.css";

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = getCompetitor(slug);
  if (!c) return {};
  return {
    title: `agentmemory vs ${c.name}`,
    description: c.summary,
    alternates: { canonical: `/vs/${c.slug}` },
  };
}

function Cell({ fact }: { fact: Fact }) {
  return (
    <>
      <span>{fact.value}</span>
      {fact.src && (
        <a className={`src ${s.cite}`} href={fact.src} target="_blank" rel="noreferrer">
          source
        </a>
      )}
    </>
  );
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = getCompetitor(slug);
  if (!c) notFound();
  const others = COMPETITORS.filter((o) => o.slug !== c.slug);
  return (
    <DocPage eyebrow="Compare" title={`agentmemory vs ${c.name}`} lede={c.summary}>
      <Prose>
        <h2>At a glance</h2>
        <div className={s.scroller} role="region" aria-label={`agentmemory and ${c.name} compared`} tabIndex={0}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col" className={s.rowHead}>
                  <span className="sr-only">Aspect</span>
                </th>
                <th scope="col">agentmemory</th>
                <th scope="col">{c.name}</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.key}>
                  <th scope="row" className={s.rowHead}>
                    {r.label}
                  </th>
                  <td data-label="agentmemory">
                    <Cell fact={AGENTMEMORY[r.key]} />
                  </td>
                  <td data-label={c.name}>
                    <Cell fact={c.rows[r.key]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={s.note}>
          Benchmark figures are each project&apos;s own published results. Different benchmarks, metrics and harnesses are
          not directly comparable.
        </p>

        <h2>How they differ</h2>
        {c.differ.map((p, i) => (
          <p key={i}>{p}</p>
        ))}

        <div className={s.choose}>
          <div>
            <h3>Choose {c.name} if</h3>
            <ul>
              {c.chooseThem.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Choose agentmemory if</h3>
            <ul>
              {c.chooseUs.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>

        {c.moving && (
          <>
            <h2>Moving from {c.name}</h2>
            <ol>
              {c.moving.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ol>
          </>
        )}

        <h2>Links</h2>
        <ul>
          <li>
            <a href={c.links.home} target="_blank" rel="noreferrer">
              {c.name} website
            </a>
          </li>
          <li>
            <a href={c.links.docs} target="_blank" rel="noreferrer">
              {c.name} docs
            </a>
          </li>
          {c.links.github && (
            <li>
              <a href={c.links.github} target="_blank" rel="noreferrer">
                {c.name} on GitHub
              </a>
            </li>
          )}
        </ul>

        <p className={s.checked}>
          Facts checked on {CHECKED_ON}. Spot something wrong?{" "}
          <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
            open an issue
          </a>
          .
        </p>

        <h2>Other comparisons</h2>
        <ul className={s.others}>
          {others.map((o) => (
            <li key={o.slug}>
              <Link href={`/vs/${o.slug}`}>agentmemory vs {o.name}</Link>
            </li>
          ))}
        </ul>
      </Prose>
    </DocPage>
  );
}
