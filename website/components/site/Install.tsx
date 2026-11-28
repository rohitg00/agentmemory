"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { AGENTS, AGENT_INSTALL_PROMPT, INSTALL_CMD } from "@/lib/site";
import { MCP_JSON } from "@/lib/rest";
import { CopyButton } from "./client";
import s from "./Install.module.css";

const CONNECTABLE = AGENTS.filter((a) => a.connect);

const HTTP_JSON = `{
  "mcpServers": {
    "agentmemory": {
      "type": "http",
      "url": "http://localhost:3111/agentmemory/mcp",
      "headers": { "Authorization": "Bearer <secret>" }
    }
  }
}`;

const REST_CURL = `curl http://localhost:3111/agentmemory/smart-search \\
  -H "Authorization: Bearer <secret>" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "auth refresh"}'`;

const OTHER = [
  {
    id: "stdio",
    tab: "MCP over stdio",
    note: "Merge this entry into the client's mcpServers object. With no variables set, it talks to http://localhost:3111.",
    code: MCP_JSON,
  },
  {
    id: "http",
    tab: "MCP over HTTP",
    note: "For a client that connects to an MCP server by URL. <secret> is AGENTMEMORY_SECRET, or the value in ~/.agentmemory/secret.",
    code: HTTP_JSON,
  },
  {
    id: "rest",
    tab: "REST",
    note: "Anything that speaks HTTP can read and write memory. <secret> is AGENTMEMORY_SECRET, or the value in ~/.agentmemory/secret.",
    code: REST_CURL,
  },
];

function breakable(text: string) {
  return text.split("/").flatMap((part, i, all) => (i < all.length - 1 ? [part, "/", <wbr key={i} />] : [part]));
}

export function Install() {
  const [pick, setPick] = useState(CONNECTABLE[0]?.connect ?? "claude-code");
  const connect = `agentmemory connect ${pick}`;
  const [otherId, setOtherId] = useState(OTHER[0]!.id);
  const other = OTHER.find((o) => o.id === otherId) ?? OTHER[0]!;
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = OTHER.length - 1;
    let next = index;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;
    event.preventDefault();
    setOtherId(OTHER[next]!.id);
    tabs.current[next]?.focus();
  };
  return (
    <section id="install" className="section" aria-labelledby="install-title">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Install</span>
          <h2 id="install-title">One command. Then pick your agent.</h2>
          <p>
            Node.js 20 or newer. The first run walks you through which agents to wire and whether to add a model provider.
            Skip it and you stay keyless.
          </p>
        </div>

        <ol className={s.steps}>
          <li className={s.step}>
            <span className={`mono ${s.n}`}>01</span>
            <div className={s.stepBody}>
              <h3>Start the memory server</h3>
              <p>Installs the pinned engine, starts the server on :3111 and the viewer on :3113.</p>
              <CopyButton text={INSTALL_CMD} label="Copy install command" className={s.cmd}>
                <span className={s.dollar} aria-hidden="true">
                  $
                </span>
                <code>{breakable(INSTALL_CMD)}</code>
              </CopyButton>
            </div>
          </li>

          <li className={s.step}>
            <span className={`mono ${s.n}`}>02</span>
            <div className={s.stepBody}>
              <h3>Wire an agent</h3>
              <p>
                Connects the selected agent through its native integration or MCP. Add <code>--with-hooks</code> for
                optional hook capture. Pi and OMP use <code>--with-mcp</code> to add the full toolset alongside their native tools.
              </p>
              <div className={s.picker} role="radiogroup" aria-label="Agent">
                {CONNECTABLE.map((a) => (
                  <button
                    key={a.connect}
                    type="button"
                    role="radio"
                    aria-checked={a.connect === pick}
                    className={s.chip}
                    onClick={() => setPick(a.connect as string)}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
              <CopyButton text={connect} label={`Copy ${connect}`} className={s.cmd}>
                <span className={s.dollar} aria-hidden="true">
                  $
                </span>
                <code key={pick} className={s.swap}>
                  {connect}
                </code>
              </CopyButton>
            </div>
          </li>

          <li className={s.step}>
            <span className={`mono ${s.n}`}>03</span>
            <div className={s.stepBody}>
              <h3>Or let your agent do it</h3>
              <p>Paste this into any coding agent. It reads the install guide and runs the steps for you.</p>
              <CopyButton text={AGENT_INSTALL_PROMPT} label="Copy agent setup prompt" className={`${s.cmd} ${s.prompt}`}>
                <code>{breakable(AGENT_INSTALL_PROMPT)}</code>
              </CopyButton>
            </div>
          </li>
        </ol>

        <div className={s.mcp}>
          <div className={s.mcpHead}>
            <div>
              <h3>Any other client</h3>
              <div className={s.picker} role="tablist" aria-label="Connection type">
                {OTHER.map((o, i) => (
                  <button
                    key={o.id}
                    ref={(node) => {
                      tabs.current[i] = node;
                    }}
                    type="button"
                    role="tab"
                    id={`other-tab-${o.id}`}
                    aria-selected={o.id === other.id}
                    aria-controls="other-panel"
                    tabIndex={o.id === other.id ? 0 : -1}
                    onKeyDown={(event) => onTabKey(event, i)}
                    className={s.chip}
                    onClick={() => setOtherId(o.id)}
                  >
                    {o.tab}
                  </button>
                ))}
              </div>
              <p>{other.note}</p>
            </div>
            <CopyButton text={other.code} label={`Copy ${other.tab} example`} className="btn btn-ghost">
              <span>Copy example</span>
            </CopyButton>
          </div>
          <pre id="other-panel" role="tabpanel" tabIndex={0} aria-labelledby={`other-tab-${other.id}`} className={s.json}>
            <code>{other.code}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}
