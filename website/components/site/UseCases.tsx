"use client";

import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import s from "./UseCases.module.css";

const LOGO = {
  claude: "https://github.com/anthropics.png",
  cursor: "https://svgl.app/library/cursor_light.svg",
  codex: "https://github.com/openai.png",
};

function st(i: number): CSSProperties {
  return { "--i": i } as CSSProperties;
}

function Win({
  title,
  logo,
  kind = "term",
  dim,
  className,
  children,
}: {
  title: string;
  logo?: string;
  kind?: "term" | "app";
  dim?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`${s.win} ${kind === "app" ? s.app : s.term} ${dim ? s.dim : ""} ${className ?? ""}`}>
      <div className={s.bar}>
        <span className={s.lights} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        {logo && <img src={logo} alt="" width={14} height={14} className={s.barLogo} />}
        <span className={`mono ${s.barTitle}`}>{title}</span>
      </div>
      <div className={s.winBody}>{children}</div>
    </div>
  );
}

function Mem({ tag, children, i }: { tag: string; children: ReactNode; i: number }) {
  return (
    <div className={`${s.step} ${s.mem}`} style={st(i)}>
      <span className={`mono ${s.memTag}`}>{tag}</span>
      <span>{children}</span>
    </div>
  );
}

function L({ i, children, className }: { i: number; children: ReactNode; className?: string }) {
  return (
    <div className={`${s.step} ${s.tl} ${className ?? ""}`} style={st(i)}>
      {children}
    </div>
  );
}

function AgentsScene() {
  const [other, setOther] = useState<"cursor" | "codex">("cursor");
  return (
    <div className={s.agents}>
      <Win title="claude-code · monday 14:02" logo={LOGO.claude}>
        <L i={0}>
          <span className={s.ccPrompt}>&gt;</span> fix login failing after ~15 minutes
        </L>
        <L i={1}>
          <span className={s.ccDot}>⏺</span> Edit(src/auth/refresh.ts)
        </L>
        <L i={2}>
          <span className={s.ccDot}>⏺</span> Bash(npm test -- auth)
        </L>
        <L i={3} className={s.ccOut}>
          ⎿ 41 passed
        </L>
        <L i={4} className={s.hookLine}>
          PostToolUse → agentmemory
        </L>
      </Win>

      <div className={s.hub} aria-hidden="true">
        <span className={`${s.packet} ${s.packetIn}`} />
        <div className={`${s.step} ${s.hubCard}`} style={st(5)}>
          <span className={`mono ${s.hubHead}`}>agentmemory · 127.0.0.1:3111</span>
          <span>Session tokens expire after 15 minutes. Refresh runs in src/auth/refresh.ts.</span>
          <span className={`mono ${s.hubFrom}`}>captured from claude-code</span>
        </div>
        <span className={`${s.packet} ${s.packetOut}`} />
      </div>

      <div className={s.otherCol}>
        <div className={s.switch} role="group" aria-label="Second agent">
          <button type="button" aria-pressed={other === "cursor"} onClick={() => setOther("cursor")}>
            Cursor
          </button>
          <button type="button" aria-pressed={other === "codex"} onClick={() => setOther("codex")}>
            Codex
          </button>
        </div>
        {other === "cursor" ? (
          <Win title="cursor · tuesday 10:15" logo={LOGO.cursor} kind="app" key="cursor">
            <div className={s.cursor}>
              <div className={s.files} aria-hidden="true">
                <span className="mono">src</span>
                <span className="mono">  auth</span>
                <span className={`mono ${s.fileOn}`}>    refresh.ts</span>
                <span className="mono">    session.ts</span>
              </div>
              <div className={s.chat}>
                <L i={6} className={s.bubble}>
                  why does login fail after 15 minutes?
                </L>
                <L i={7} className={s.toolChip}>
                  memory_recall · 1 result
                </L>
                <L i={8} className={s.reply}>
                  Fixed Monday in refresh.ts, from a Claude Code session. This route skips that middleware.
                </L>
              </div>
            </div>
          </Win>
        ) : (
          <Win title="codex · tuesday 10:15" logo={LOGO.codex} key="codex">
            <L i={6}>
              <span className={s.ccPrompt}>›</span> why does login fail after 15 minutes?
            </L>
            <L i={7} className={s.ccOut}>
              • Called agentmemory.memory_recall
            </L>
            <L i={8}>
              Fixed Monday in refresh.ts, from a Claude Code session. This route skips that middleware.
            </L>
          </Win>
        )}
      </div>
    </div>
  );
}

function ContextScene() {
  return (
    <div className={s.single}>
      <Win title="claude-code · ~/acme-api" logo={LOGO.claude}>
        <div className={`${s.step} ${s.welcome}`} style={st(0)}>
          <span>✻ Welcome to Claude Code</span>
          <span className={s.muted}>cwd: ~/acme-api</span>
        </div>
        <Mem tag="SessionStart · agentmemory · 3 memories" i={1}>
          pnpm workspace. Tests run with pnpm vitest run. Never edit src/generated/, it is built from the schema.
        </Mem>
        <L i={2}>
          <span className={s.ccPrompt}>&gt;</span> run the tests
        </L>
        <L i={3}>
          <span className={s.ccDot}>⏺</span> Bash(pnpm vitest run)
        </L>
        <L i={4} className={s.ccOut}>
          ⎿ 212 passed
        </L>
      </Win>
    </div>
  );
}

function HandoffScene() {
  return (
    <div className={s.handoff}>
      <Win title="monday 18:40" logo={LOGO.claude} dim>
        <L i={0}>
          <span className={s.ccDot}>⏺</span> Edit(routes/orders.ts)
        </L>
        <L i={1} className={s.ccOut}>
          ⎿ 3 of 5 routes moved to refresh tokens
        </L>
        <L i={2} className={s.muted}>
          laptop closed. session ended.
        </L>
      </Win>
      <div className={`${s.step} ${s.night}`} style={st(3)}>
        <span className="mono">overnight</span>
      </div>
      <Win title="tuesday 09:12" logo={LOGO.claude}>
        <L i={4}>
          <span className={s.ccPrompt}>&gt;</span> /handoff
        </L>
        <Mem tag="last session · monday 18:40" i={5}>
          Moving auth to refresh tokens. 3 of 5 routes done. Open question: cookie or header for the refresh token?
        </Mem>
        <L i={6}>
          Next up is routes/billing.ts. Before I start: cookie or header?
        </L>
      </Win>
    </div>
  );
}

function LessonScene() {
  return (
    <div className={s.lesson}>
      <ol className={s.timeline}>
        <li className={`${s.step} ${s.node}`} style={st(0)}>
          <span className={`mono ${s.when}`}>week 1</span>
          <span className={s.say}>&quot;Never mock the database in integration tests.&quot;</span>
          <span className={s.muted}>you correct the agent once</span>
        </li>
        <li className={`${s.step} ${s.node}`} style={st(1)}>
          <span className={`mono ${s.when}`}>saved</span>
          <span className={s.say}>/lesson</span>
          <span className={s.conf}>
            <span className="mono">confidence</span>
            <span className={s.meter}>
              <span />
            </span>
          </span>
        </li>
        <li className={`${s.step} ${s.node}`} style={st(2)}>
          <span className={`mono ${s.when}`}>week 3</span>
          <span className={s.say}>&quot;write an integration test for checkout&quot;</span>
          <span className={s.muted}>similar work starts</span>
        </li>
      </ol>
      <Win title="claude-code · week 3" logo={LOGO.claude}>
        <Mem tag="lesson · resurfaced before similar work" i={3}>
          Never mock the database in integration tests. Use the test container.
        </Mem>
        <L i={4}>
          <span className={s.ccDot}>⏺</span> Write(test/checkout.test.ts)
        </L>
        <L i={5} className={s.ccOut}>
          ⎿ uses the test container, no database mock
        </L>
      </Win>
    </div>
  );
}

const CODE = [
  "export async function refresh(req, res, next) {",
  "  const token = readSession(req);",
  "  if (!token) return next();",
  "  if (expiresWithin(token, 60)) {",
  "    await rotate(token);",
  "  }",
  "  return next();",
  "}",
];

function WhyScene() {
  return (
    <div className={s.single}>
      <Win title="src/auth/refresh.ts" kind="app">
        <div className={s.editor}>
          {CODE.map((line, n) => (
            <div key={n} className={`${s.codeLine} ${n === 3 ? s.codeOn : ""}`}>
              <span className={`mono ${s.ln}`}>{40 + n - 1}</span>
              <span className={`mono ${s.code}`}>{line}</span>
              {n === 3 && <span className={`mono ${s.blame} ${s.step}`} style={st(0)}>a41c9e2 · fix</span>}
            </div>
          ))}
          <div className={`${s.step} ${s.pop}`} style={st(1)}>
            <span className={`mono ${s.popCmd}`}>/commit-context src/auth/refresh.ts:42</span>
            <span className={`mono ${s.memTag}`}>session · monday 14:02 · claude-code</span>
            <span>Tokens expired at 15 minutes under load. Refresh moved into middleware so every route rotates early.</span>
            <span className={`mono ${s.memTag}`}>2 failing auth tests, then 41 passing</span>
          </div>
        </div>
      </Win>
    </div>
  );
}

const FILES = ["-acme-api/3f1c….jsonl", "-acme-api/9b07….jsonl", "-acme-web/41de….jsonl", "-infra/c2a8….jsonl", "-acme-api/e6f3….jsonl"];

function ImportScene() {
  return (
    <div className={s.importGrid}>
      <Win title="terminal">
        <L i={0}>
          <span className={s.ccPrompt}>$</span> npx -y @agentmemory/agentmemory@latest import-jsonl
        </L>
        <L i={1} className={s.muted}>
          reading ~/.claude/projects
        </L>
        {FILES.map((f, n) => (
          <L key={f} i={2 + n} className={s.ccOut}>
            ✓ {f}
          </L>
        ))}
        <L i={7}>past sessions are searchable and show up in the viewer&apos;s Replay tab</L>
      </Win>
      <figure className={`${s.step} ${s.quote}`} style={st(8)}>
        <blockquote>&quot;I backfilled agent memory on my past month&apos;s Cursor agent transcripts. It was surprisingly accurate. Picked up on things that I moved away from.&quot;</blockquote>
        <figcaption className="mono">
          Peter Neyra ·{" "}
          <a className="src" href="https://www.producthunt.com/p/agent-memory-dev/how-do-you-found-agentmemory-so-far-happy-to-help?comment=5379518" target="_blank" rel="noreferrer">
            source
          </a>
        </figcaption>
      </figure>
    </div>
  );
}

interface UseCase {
  id: string;
  title: string;
  why: string;
  without: string;
  scene: () => ReactNode;
}

const CASES: UseCase[] = [
  {
    id: "agents",
    title: "One memory for every agent",
    why: "Claude Code, Cursor, Codex and the rest share one local memory server.",
    without: "Each tool starts blind. You retell Cursor what Claude Code already found.",
    scene: () => <AgentsScene />,
  },
  {
    id: "context",
    title: "Stop re-explaining your project",
    why: "Your stack, commands and rules load before your first message.",
    without: "npm test, missing script, and you explain pnpm and vitest again.",
    scene: () => <ContextScene />,
  },
  {
    id: "handoff",
    title: "Pick up where you left off",
    why: "Close the laptop mid-task. Tomorrow's session knows what was half done.",
    without: "\"I don't have context from previous sessions.\"",
    scene: () => <HandoffScene />,
  },
  {
    id: "lesson",
    title: "Correct it once",
    why: "When you correct your agent, the rule is kept and comes back before similar work.",
    without: "Week 3, the same database mock, the same correction.",
    scene: () => <LessonScene />,
  },
  {
    id: "why",
    title: "Ask why the code looks like this",
    why: "Every commit links back to the session that produced it.",
    without: "git blame says \"fix\". Fix what?",
    scene: () => <WhyScene />,
  },
  {
    id: "import",
    title: "Start with months of history",
    why: "Import the transcripts you already have. Day one is not empty.",
    without: "Memory starts empty, and every past session is lost.",
    scene: () => <ImportScene />,
  },
];

function PanelBody({ c }: { c: (typeof CASES)[number] }) {
  return (
    <>
      <p className={s.why}>{c.why}</p>
      <div className={s.stage}>{c.scene()}</div>
      <div className={s.without}>
        <span className="mono">without memory</span>
        <span>{c.without}</span>
      </div>
    </>
  );
}

export function UseCases() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = CASES.length - 1;
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = i === last ? 0 : i + 1;
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = i === 0 ? last : i - 1;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = last;
    if (next < 0) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <section id="use-cases" className="section" aria-labelledby="uc-title">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Use cases</span>
          <h2 id="uc-title">What changes when your agent remembers.</h2>
          <p>Six things that happen every week with a coding agent, and what they look like with agentmemory running.</p>
        </div>

        <div className={s.tabs} role="tablist" aria-label="Use cases">
          {CASES.map((u, i) => (
            <button
              key={u.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              role="tab"
              id={`uc-tab-${u.id}`}
              aria-selected={i === active}
              aria-controls="uc-panel"
              tabIndex={i === active ? 0 : -1}
              className={s.tab}
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <span className={`mono ${s.num}`}>{String(i + 1).padStart(2, "0")}</span>
              <span>{u.title}</span>
            </button>
          ))}
        </div>

        <div className={s.panels}>
          {CASES.map((u, i) =>
            i === active ? (
              <div key={u.id} id="uc-panel" role="tabpanel" aria-labelledby={`uc-tab-${u.id}`} className={s.panel}>
                <PanelBody c={u} />
              </div>
            ) : (
              <div key={`size-${u.id}`} className={`${s.panel} ${s.sizer}`} aria-hidden="true" inert>
                <PanelBody c={u} />
              </div>
            ),
          )}
        </div>
        <p className={`mono ${s.note}`}>Example sessions. The commands, skills and hooks shown are real.</p>
      </div>
    </section>
  );
}
