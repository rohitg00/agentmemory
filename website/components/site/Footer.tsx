import Link from "next/link";
import { DOCS_URL, NPM_URL, REPO_URL, SITE_URL } from "@/lib/site";
import { getProjectMeta } from "@/lib/meta";
import { COMPETITORS } from "@/lib/compare";
import { Logo } from "./Logo";
import s from "./Footer.module.css";

const ASK = `Read ${SITE_URL}/llms-full.txt and explain what agentmemory does, how it stores memory locally, and how to install it for my coding agent.`;

const ASK_LINKS = [
  { name: "ChatGPT", href: `https://chatgpt.com/?q=${encodeURIComponent(ASK)}` },
  { name: "Claude", href: `https://claude.ai/new?q=${encodeURIComponent(ASK)}` },
  { name: "Perplexity", href: `https://www.perplexity.ai/search?q=${encodeURIComponent(ASK)}` },
];

const COLUMNS = [
  {
    head: "Product",
    links: [
      { label: "Use cases", href: "/#use-cases" },
      { label: "How it works", href: "/#how" },
      { label: "Benchmarks", href: "/benchmarks" },
      { label: "Install", href: "/#install" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  {
    head: "Trust",
    links: [
      { label: "Security", href: "/security" },
      { label: "Privacy", href: "/privacy" },
      { label: "License, Apache-2.0", href: `${REPO_URL}/blob/main/LICENSE` },
      { label: "Report a vulnerability", href: `${REPO_URL}/security/advisories/new` },
    ],
  },
  {
    head: "Developers",
    links: [
      { label: "Docs", href: DOCS_URL },
      { label: "GitHub", href: REPO_URL },
      { label: "npm", href: NPM_URL },
      { label: "Issues", href: `${REPO_URL}/issues` },
    ],
  },
  {
    head: "Compare",
    links: [
      ...COMPETITORS.map((c) => ({ label: `vs ${c.name}`, href: `/vs/${c.slug}` })),
      { label: "All comparisons", href: "/vs" },
    ],
  },
  {
    head: "For agents",
    links: [
      { label: "llms.txt", href: "/llms.txt" },
      { label: "llms-full.txt", href: "/llms-full.txt" },
      { label: "INSTALL_FOR_AGENTS.md", href: `${REPO_URL}/blob/main/INSTALL_FOR_AGENTS.md` },
    ],
  },
];

function isExternal(href: string) {
  return href.startsWith("http");
}

export function Footer() {
  const meta = getProjectMeta();
  return (
    <footer className={s.footer}>
      <div className={`wrap ${s.ask}`}>
        <div>
          <span className="eyebrow">Ask an AI about agentmemory</span>
          <p className={s.askText}>Open your assistant with our full docs already in the prompt.</p>
        </div>
        <div className={s.askLinks}>
          {ASK_LINKS.map((a) => (
            <a key={a.name} className="btn btn-ghost" href={a.href} target="_blank" rel="noreferrer">
              {a.name}
            </a>
          ))}
        </div>
      </div>
      <div className={`wrap ${s.grid}`}>
        <div className={s.brand}>
          <Link href="/" className={s.logo}>
            <Logo />
            <span>agentmemory</span>
          </Link>
          <p>Persistent memory for AI coding agents. Runs on your machine.</p>
          <p className="mono">v{meta.version} · Apache-2.0</p>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.head} className={s.col} aria-label={c.head}>
            <span className="mono">{c.head}</span>
            {c.links.map((l) =>
              isExternal(l.href) ? (
                <a key={l.label} href={l.href} target="_blank" rel="noreferrer">
                  {l.label}
                </a>
              ) : (
                <Link key={l.label} href={l.href}>
                  {l.label}
                </Link>
              ),
            )}
          </nav>
        ))}
      </div>
    </footer>
  );
}
