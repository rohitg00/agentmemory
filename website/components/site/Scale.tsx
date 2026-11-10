import { REPO_URL } from "@/lib/site";
import { Reveal } from "./client";
import s from "./Scale.module.css";

const pr = (n: number) => `${REPO_URL}/pull/${n}`;

const BEFORE = [
  { step: "state::list", note: "whole scope in one message" },
  { step: "16 MiB frame", note: "worker transport limit" },
  { step: "payload_too_large", note: "a big store looked empty", bad: true },
];

const AFTER = [
  { step: "state::list_keys", note: "keys first, then records in pages" },
  { step: "64 MiB frame", note: "60 MiB payload guard below it" },
  { step: "every record", note: "scopes past 64 MiB keep working", good: true },
];

const GAINS = [
  {
    version: "0.9.33",
    title: "Recall keeps every strong match",
    text: "Saved memories are no longer capped at three per search, and keyword and vector search each pass at least 40 candidates into fusion.",
    href: pr(1696),
    ref: "#1696",
  },
  {
    version: "0.9.33",
    title: "Long calls finish",
    text: "The MCP shim no longer cuts proxied calls off at 15 s. It waits 190 s, past the 180 s server limit, so consolidate and reflect complete on large stores.",
    href: pr(1691),
    ref: "#1691",
  },
  {
    version: "0.9.33",
    title: "Bounded reflection",
    text: "Reflection reads lessons and crystals in pages and caps the evidence and insight it returns.",
    href: pr(1544),
    ref: "#1544",
  },
  {
    version: "0.9.33",
    title: "Lean indexes",
    text: "Evicted memories leave the keyword and vector indexes, and boot finds gaps in a partly embedded vector index.",
    href: pr(1601),
    ref: "#1601, #1687",
  },
  {
    version: "0.9.31",
    title: "Incremental summaries",
    text: "Summaries cover only what was captured since the last run. A session end with nothing new costs no LLM call.",
    href: `${REPO_URL}/blob/main/CHANGELOG.md`,
    ref: "changelog",
  },
  {
    version: "0.9.31",
    title: "Graph never stalls a search",
    text: "Graph enrichment gets 500 ms. When it runs out, keyword and vector results return without it.",
    href: `${REPO_URL}/blob/main/docs/reliability/graph-search-budget.md`,
    ref: "search budget",
  },
];

function Lane({ label, rows, tone }: { label: string; rows: { step: string; note: string; bad?: boolean; good?: boolean }[]; tone: "before" | "after" }) {
  return (
    <div className={`${s.lane} ${tone === "after" ? s.after : ""}`}>
      <span className={`mono ${s.laneLabel}`}>{label}</span>
      <ol className={s.steps}>
        {rows.map((r, i) => (
          <li
            key={r.step}
            className={`${s.step} ${r.bad ? s.bad : ""} ${r.good ? s.good : ""}`}
            style={{ ["--i" as string]: i }}
          >
            <code className={s.stepName}>{r.step}</code>
            <span className={`mono ${s.stepNote}`}>{r.note}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Scale() {
  return (
    <section id="performance" className="section" aria-labelledby="performance-title">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Performance</span>
          <h2 id="performance-title">Built to keep years of sessions searchable.</h2>
          <p>
            Your agent returns the top results, not the whole history. Under that, every read that could grow with your store
            now pages, so a large memory stays fast to boot, search and export.
          </p>
        </div>

        <Reveal className={s.figure}>
          <div className={s.figHead}>
            <span className="mono">reading a large memory scope</span>
            <a className="src" href={pr(1636)} target="_blank" rel="noreferrer">
              #1634, #1636
            </a>
          </div>
          <Lane label="before 0.9.33" rows={BEFORE} tone="before" />
          <Lane label="0.9.33" rows={AFTER} tone="after" />
        </Reveal>

        <ol className={s.gains}>
          {GAINS.map((g, i) => (
            <Reveal as="li" key={g.title} delay={i * 50} className={s.gain}>
              <span className={`mono ${s.version}`}>v{g.version}</span>
              <h3>{g.title}</h3>
              <p>{g.text}</p>
              <a className="src" href={g.href} target="_blank" rel="noreferrer">
                {g.ref}
              </a>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
