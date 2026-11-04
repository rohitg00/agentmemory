import type { Metadata } from "next";
import { DocPage, Prose } from "@/components/site/Doc";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What agentmemory records, where it keeps it, how long, what can leave your machine, and how to view and delete it.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <DocPage
      eyebrow="Privacy"
      title="Privacy"
      lede="agentmemory is open-source software that runs on your computer. There is no account, no hosted service and no analytics. The project never receives your data."
    >
      <Prose>
        <p>
          <em>Last updated: 3 November 2026.</em> This policy covers the agentmemory server, its plugins for coding
          agents such as the Claude Code plugin, and its MCP server.
        </p>

        <h2>What agentmemory records</h2>
        <p>
          When you install an agentmemory plugin with hooks, the hooks send these events to the agentmemory server on
          your machine:
        </p>
        <ul>
          <li>each prompt you submit, and prompts recovered from the session transcript when a session ends</li>
          <li>
            the name, input and output of each tool call, and the error when a call fails, including results that
            other connectors and MCP servers return
          </li>
          <li>the final reply of the assistant and of each subagent, up to 4,000 characters</li>
          <li>session start and end, subagent start, notifications and completed tasks, with the working directory</li>
        </ul>
        <p>
          It also stores the memories, lessons and other records that you or your agent save with its tools. Before
          storage, <code>&lt;private&gt;</code> blocks and common secret formats, such as API keys, tokens and private
          keys, are replaced with redaction markers.
        </p>

        <h2>Where it is kept</h2>
        <p>Records are saved in a data folder on your machine:</p>
        <ul>
          <li>
            macOS: <code>~/Library/Application Support/agentmemory</code>
          </li>
          <li>
            Linux: <code>~/.local/share/agentmemory</code>, or <code>$XDG_DATA_HOME/agentmemory</code>
          </li>
          <li>
            Windows: <code>%APPDATA%\agentmemory</code>
          </li>
        </ul>
        <p>
          You can choose another folder with <code>--data-dir</code> or <code>AGENTMEMORY_DATA_DIR</code>. Settings
          live in <code>~/.agentmemory/.env</code>. If the server is not running, hook events wait in the{" "}
          <code>capture-spool</code> folder inside the data folder and are sent when the server comes back. The spool
          holds at most 5 MiB and drops events older than 7 days. Diagnostic traces are written to the{" "}
          <code>observability</code> folder inside the data folder and stay on your machine.
        </p>
        <p>
          If you configure a Redis state backend, records are stored on that Redis server instead of the local
          folder.
        </p>

        <h2>How long it is kept</h2>
        <p>
          Records are kept until you delete them. Each session keeps at most 500 observations by default. Memories
          that carry an expiry date are deleted automatically after that date. The audit log is kept until you delete
          it, unless you set <code>AGENTMEMORY_AUDIT_RETENTION_MONTHS</code>.
        </p>

        <h2>What can leave your machine</h2>
        <p>
          By default, nothing that agentmemory records leaves your machine. Search runs on local keyword matching and
          no AI model is called. Content is sent elsewhere only after you turn on one of these options:
        </p>
        <ul>
          <li>
            <strong>An LLM provider.</strong> When <code>AGENTMEMORY_LLM_PROVIDER</code> selects Anthropic, OpenAI,
            Gemini, OpenRouter or MiniMax, session summaries, consolidation and reflection send excerpts of recorded
            prompts, tool calls and replies to that provider. With <code>AGENTMEMORY_AUTO_COMPRESS=true</code>, each
            new observation is also sent for compression. A provider key that is already in your environment for
            another tool is never enough to turn this on. An OpenAI-compatible server on your own machine, such as
            Ollama, keeps the content local.
          </li>
          <li>
            <strong>The Claude Agent SDK fallback.</strong> With <code>AGENTMEMORY_ALLOW_AGENT_SDK=true</code> and no
            provider selected, the same excerpts go to Claude through the Claude Agent SDK.
          </li>
          <li>
            <strong>A cloud embedding provider.</strong> When <code>EMBEDDING_PROVIDER</code> is <code>gemini</code>,{" "}
            <code>openai</code>, <code>voyage</code>, <code>cohere</code> or <code>openrouter</code>, the text of
            observations, memories and search queries is sent to that service to build search vectors.{" "}
            <code>EMBEDDING_PROVIDER=local</code> runs on your machine.
          </li>
          <li>
            <strong>A remote state backend.</strong> A Redis backend stores all records on the Redis server you
            configure.
          </li>
          <li>
            <strong>Mesh sync.</strong> It sends memories to peer agentmemory servers that you register.
          </li>
          <li>
            <strong>A remote agentmemory server.</strong> If you point a plugin at a server on another machine, the
            hooks send what they record to that server. The plugins send the server secret only over HTTPS or to a
            loopback address.
          </li>
        </ul>
        <p>
          Each of these services handles the content it receives under its own privacy policy. Installation, updates
          and the first local embedding model download also need network access, and send no recorded content.
        </p>

        <h2>View, export and delete</h2>
        <ul>
          <li>
            View records in the viewer at <code>http://localhost:3113</code>, or run <code>agentmemory status</code>.
          </li>
          <li>
            Export everything with the <code>memory_export</code> tool or <code>GET /agentmemory/export</code>.
          </li>
          <li>
            Delete single records with the <code>forget</code> skill or the <code>memory_governance_delete</code> tool.
          </li>
          <li>
            Delete everything by stopping the server with <code>agentmemory stop</code> and deleting the data folder,
            the capture spool inside it, and <code>~/.agentmemory</code>. With a Redis state backend, also delete
            agentmemory&apos;s records from that Redis server, for example by flushing the Redis database you gave
            agentmemory.
          </li>
        </ul>

        <h2>Telemetry</h2>
        <p>
          None. agentmemory sends no usage data, and it starts the iii engine with its usage telemetry turned off.
        </p>

        <h2>Children</h2>
        <p>agentmemory is a developer tool and is not intended for people under 18.</p>

        <h2>Contact</h2>
        <p>
          <a href="https://github.com/rohitg00/agentmemory/issues">github.com/rohitg00/agentmemory/issues</a>
        </p>
      </Prose>
    </DocPage>
  );
}
