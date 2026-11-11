import { INSTALL_CMD } from "@/lib/site";
import { Reveal } from "./client";
import s from "./Runtime.module.css";

const SESSION = [
  { cmd: INSTALL_CMD, out: "installs the pinned iii engine on macOS, Linux or Windows, then starts Worker Compose" },
  { cmd: "agentmemory connect claude-code", out: "wires MCP and capture hooks into the agent you pick" },
  { cmd: "agentmemory demo --serve", out: "seeds sample sessions, shows recall, then stops the server it started" },
  { cmd: "agentmemory doctor", out: "finds config problems and offers a fix for each one" },
  { cmd: "agentmemory status", out: "health, memory count, feature flags and anything that needs attention" },
];

const STACK = [
  { name: "iii engine", sub: "127.0.0.1:49134", note: "pinned version, checksum verified" },
  { name: "state worker", sub: "file state", note: "your data directory" },
  { name: "http worker", sub: "REST :3111", note: "bearer secret made on first start" },
  { name: "agentmemory worker", sub: "capture, search, graph", note: "viewer on :3113" },
];

const FACTS = [
  {
    key: "keys",
    text: "None needed. Capture, keyword and graph search run on your machine. LLM features and cloud embeddings start only when you name a provider.",
  },
  {
    key: "service",
    text: "Keep it running after logout with the systemd and launchd recipes, or one Docker Compose file.",
    href: "/docs/deployment",
    link: "deployment guide",
  },
  {
    key: "undo",
    text: "agentmemory remove shows a plan, unwires every agent it connected and keeps your memory data unless you say otherwise.",
  },
];

export function Runtime() {
  return (
    <section id="devex" className="section" aria-labelledby="devex-title">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Developer experience</span>
          <h2 id="devex-title">One command runs the whole memory stack.</h2>
          <p>
            No database to provision, no account, no Docker required. The CLI installs the runtime it needs, starts it on
            loopback, wires your agents and tells you in plain words when something is off.
          </p>
        </div>

        <Reveal className={s.figure}>
          <div className={s.term} role="img" aria-label="A terminal session that starts agentmemory, connects an agent, runs the demo, the doctor and the status check">
            <div className={s.termHead}>
              <span className={s.lights} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="mono">~/project</span>
            </div>
            <ol className={s.lines}>
              {SESSION.map((l, i) => (
                <li key={l.cmd} className={s.line} style={{ ["--i" as string]: i }}>
                  <code className={s.cmd}>
                    <span className={s.dollar} aria-hidden="true">
                      $
                    </span>
                    {l.cmd}
                  </code>
                  <span className={`mono ${s.out}`}>{l.out}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className={s.stack}>
            <div className={s.stackHead}>
              <span className="mono">started by that first command</span>
            </div>
            <ol className={s.layers}>
              {STACK.map((w, i) => (
                <li key={w.name} className={s.layer} style={{ ["--i" as string]: i }}>
                  <span className={s.layerName}>{w.name}</span>
                  <span className={`mono ${s.layerSub}`}>{w.sub}</span>
                  <span className={`mono ${s.layerNote}`}>{w.note}</span>
                </li>
              ))}
            </ol>
            <p className={`mono ${s.stackFoot}`}>
              one Worker Compose project per instance; <span className={s.nowrap}>--instance 1</span> runs a second one beside it
            </p>
          </div>
        </Reveal>

        <ul className={s.facts}>
          {FACTS.map((f) => (
            <li key={f.key}>
              <span className="mono">{f.key}</span>
              <span>
                {f.text}
                {f.href ? (
                  <>
                    {" "}
                    <a className="src" href={f.href}>
                      {f.link}
                    </a>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
