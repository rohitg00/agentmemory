import type { Metadata } from "next";
import changelog from "@/lib/generated-changelog.json" with { type: "json" };
import { DocPage, Prose } from "@/components/site/Doc";
import { Markdown } from "@/lib/markdown";
import { src } from "@/lib/site";
import s from "./changelog.module.css";

export const metadata: Metadata = {
  title: "Changelog",
  description: "Every agentmemory release: what changed, what was fixed, and what to do when you upgrade.",
  alternates: { canonical: "/changelog" },
};

interface Release {
  version: string;
  date: string;
  body: string;
}

function formatDate(d: string) {
  if (!d) return "";
  const date = new Date(`${d}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export default function ChangelogPage() {
  const releases = changelog as Release[];
  return (
    <DocPage
      eyebrow="Changelog"
      title="What shipped, release by release."
      lede={
        <>
          The latest {releases.length} releases, generated from{" "}
          <a className="src" href={src.changelog} target="_blank" rel="noreferrer">
            CHANGELOG.md
          </a>{" "}
          when the site builds. Older releases are on GitHub.
        </>
      }
    >
      <div className={s.layout}>
        <nav className={s.toc} aria-label="Releases">
          <span className="mono">Releases</span>
          <ul>
            {releases.map((r) => (
              <li key={r.version}>
                <a href={`#v${r.version}`}>
                  <span className="mono">v{r.version}</span>
                  <span>{formatDate(r.date)}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className={s.releases}>
          {releases.map((r) => (
            <article key={r.version} id={`v${r.version}`} className={s.release}>
              <header className={s.head}>
                <h2>
                  <a href={`#v${r.version}`}>v{r.version}</a>
                </h2>
                {r.date && (
                  <time className="mono" dateTime={r.date}>
                    {formatDate(r.date)}
                  </time>
                )}
              </header>
              <Prose>
                <Markdown source={r.body} idPrefix={`v${r.version}`} />
              </Prose>
            </article>
          ))}
          <p className={s.more}>
            <a className="btn btn-ghost" href={src.releases} target="_blank" rel="noreferrer">
              All releases on GitHub
            </a>
          </p>
        </div>
      </div>
    </DocPage>
  );
}
