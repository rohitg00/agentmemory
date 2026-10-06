import { AGENTS, type Agent } from "@/lib/site";
import { LOGO_OVERRIDES } from "@/lib/rest";
import { CopyButton, Reveal } from "./client";
import s from "./Agents.module.css";

const LABEL: Record<Agent["support"], string> = {
  plugin: "native plugin",
  mcp: "MCP server",
  rest: "REST API",
};

function Card({ agent, index }: { agent: Agent; index: number }) {
  const cmd = agent.connect ? `agentmemory connect ${agent.connect}` : null;
  return (
    <Reveal as="li" delay={Math.min(index, 12) * 40} className={s.cell}>
      <div className={s.card} tabIndex={0} aria-label={`${agent.name}: ${agent.detail}`}>
        <div className={s.top}>
          <span className={s.tile}>
            <img className={s.logo} src={LOGO_OVERRIDES[agent.name] ?? agent.logo} alt="" width={28} height={28} loading="lazy" decoding="async" />
          </span>
          <div className={s.name}>
            <a href={agent.href} target="_blank" rel="noreferrer">
              {agent.name}
            </a>
            <span className="mono">{LABEL[agent.support]}</span>
          </div>
        </div>
        <div className={s.more}>
          {agent.detail !== LABEL[agent.support] ? <span className={s.detail}>{agent.detail}</span> : <span />}
          {cmd ? (
            <CopyButton text={cmd} label={`Copy ${cmd}`} className={s.cmd}>
              <code>
                agentmemory connect <span className={s.slug}>{agent.connect}</span>
              </code>
            </CopyButton>
          ) : (
            <span className={`mono ${s.cmdNone}`}>add the MCP block below</span>
          )}
        </div>
      </div>
    </Reveal>
  );
}

export function Agents() {
  const plugins = AGENTS.filter((a) => a.support === "plugin");
  const rest = AGENTS.filter((a) => a.support !== "plugin");
  const groups = [
    { title: "Native plugins", note: "Hooks capture automatically. Nothing to remember to call.", items: plugins, offset: 0 },
    { title: "MCP and REST", note: "Any MCP client gets the memory tools. Anything that speaks HTTP can use the REST API.", items: rest, offset: plugins.length },
  ];
  return (
    <section id="agents" className="section" aria-labelledby="agents-title">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Works with</span>
          <h2 id="agents-title">
            {AGENTS.length} agents. One memory.
          </h2>
          <p>
            Switch agents mid-project and the memory comes with you. Every agent below reads and writes the same store on
            your machine.
          </p>
        </div>
        {groups.map((g) => (
          <div key={g.title} className={s.group}>
            <div className={s.groupHead}>
              <h3>
                {g.title} <span className="mono">{g.items.length}</span>
              </h3>
              <p>{g.note}</p>
            </div>
            <ul className={s.grid}>
              {g.items.map((a, i) => (
                <Card key={a.name} agent={a} index={g.offset + i} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
