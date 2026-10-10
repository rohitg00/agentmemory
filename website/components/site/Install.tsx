"use client";

import { useState } from "react";
import { AGENTS, AGENT_INSTALL_PROMPT, INSTALL_CMD } from "@/lib/site";
import { MCP_JSON } from "@/lib/rest";
import { CopyButton } from "./client";
import s from "./Install.module.css";

const CONNECTABLE = AGENTS.filter((a) => a.connect);

function breakable(text: string) {
  return text.split("/").flatMap((part, i, all) => (i < all.length - 1 ? [part, "/", <wbr key={i} />] : [part]));
}

export function Install() {
  const [pick, setPick] = useState(CONNECTABLE[0]?.connect ?? "claude-code");
  const connect = `agentmemory connect ${pick}`;
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
                Writes the MCP entry for the agent you pick. Add <code>--with-hooks</code> for automatic capture where the
                agent supports it.
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
              <h3>Any other MCP client</h3>
              <p>
                Merge this entry into the client&apos;s <code>mcpServers</code> object. With no variables set, it talks to
                http://localhost:3111.
              </p>
            </div>
            <CopyButton text={MCP_JSON} label="Copy MCP configuration" className="btn btn-ghost">
              <span>Copy JSON</span>
            </CopyButton>
          </div>
          <pre className={s.json}>
            <code>{MCP_JSON}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}
