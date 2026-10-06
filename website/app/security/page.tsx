import type { Metadata } from "next";
import { DocPage, Prose } from "@/components/site/Doc";
import { GATE_SOURCE, GATE_WORKFLOW } from "@/lib/trust";
import { REPO_URL } from "@/lib/site";
import { Durability } from "@/components/site/Durability";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How agentmemory keeps memory local: loopback binding, auth on by default, secret redaction, file path roots, a pinned and checksummed engine, and a crash-tested release gate.",
  alternates: { canonical: "/security" },
};

export default function SecurityPage() {
  return (
    <DocPage
      eyebrow="Security"
      title="The security model, in plain language"
      lede="agentmemory is a local process that remembers what your coding agent did. This page lists what runs where, what is protected, and what is not."
    >
      <Prose>
        <h2>What runs where</h2>
        <p>Everything runs on your machine. A default install starts these listeners, all bound to 127.0.0.1:</p>
        <table>
          <thead>
            <tr>
              <th>Port</th>
              <th>Process</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>3111</code>
              </td>
              <td>agentmemory</td>
              <td>REST API and MCP over HTTP</td>
            </tr>
            <tr>
              <td>
                <code>3112</code>
              </td>
              <td>iii engine</td>
              <td>Internal streams for the server and the viewer</td>
            </tr>
            <tr>
              <td>
                <code>3113</code>
              </td>
              <td>agentmemory</td>
              <td>Real-time viewer</td>
            </tr>
            <tr>
              <td>
                <code>49134</code>
              </td>
              <td>iii engine</td>
              <td>Worker WebSocket</td>
            </tr>
          </tbody>
        </table>
        <p>
          Configuration and the secret live in <code>~/.agentmemory</code>. Stored state lives in the platform data
          directory: <code>~/Library/Application Support/agentmemory</code> on macOS,{" "}
          <code>$XDG_DATA_HOME/agentmemory</code> or <code>~/.local/share/agentmemory</code> on Linux, and{" "}
          <code>%APPDATA%\agentmemory</code> on Windows. <code>AGENTMEMORY_DATA_DIR</code> moves it.
        </p>

        <h2>Authentication is on by default</h2>
        <p>
          When <code>AGENTMEMORY_SECRET</code> is not set, the server generates a random secret on first start and writes
          it to <code>~/.agentmemory/secret</code> with mode <code>0600</code>. Every bundled client reads it from there:
          the CLI, the viewer, the hooks, the MCP server and the configs written by <code>agentmemory connect</code>. The
          stored secret is only sent to loopback addresses. Secrets are compared in constant time.
        </p>
        <pre>
          <code>{`curl -H "Authorization: Bearer $(cat ~/.agentmemory/secret)" \\
  http://localhost:3111/agentmemory/health`}</code>
        </pre>
        <p>
          An explicit <code>AGENTMEMORY_SECRET</code> always wins. Remote clients need it set, and mesh sync between
          machines requires it on both peers.
        </p>

        <h2>Requests from browsers</h2>
        <p>
          Writes to the REST API and the viewer must send <code>Content-Type: application/json</code>. When a request
          carries an <code>Origin</code> header, it must be a loopback origin for the configured ports or be listed in{" "}
          <code>VIEWER_ALLOWED_ORIGINS</code>. A web page you happen to visit cannot write to your memory.
        </p>

        <h2>File access is confined</h2>
        <p>
          Endpoints that read or write files only accept paths under <code>~/.agentmemory</code>, the data directory, or a
          directory you list in <code>AGENTMEMORY_IMPORT_ROOT</code>. Symlinks are resolved before every check.
        </p>

        <h2>What gets captured, and how to limit it</h2>
        <p>
          Hooks capture your prompts, the tools your agent calls and a bounded copy of their output. Tools named{" "}
          <code>memory_*</code> and a few discovery tools are skipped by default.
        </p>
        <ul>
          <li>
            <code>AGENTMEMORY_CAPTURE_DENY</code> adds tool names or globs to skip.
          </li>
          <li>
            <code>AGENTMEMORY_CAPTURE_ALLOW</code> captures only the tools you list.
          </li>
          <li>
            <code>AGENTMEMORY_CAPTURE_OUTPUT_MAX</code> caps how much tool output is stored per observation.
          </li>
          <li>
            Text inside <code>&lt;private&gt;</code> tags is replaced with <code>[REDACTED]</code> before it is stored.
          </li>
        </ul>

        <h2>Secrets are redacted before storage</h2>
        <p>
          Captured text is scanned before it is written. API keys, bearer tokens, private key blocks, credentials in URLs,
          and common token formats from model providers, GitHub, GitLab, Slack, AWS, Google and npm are replaced with{" "}
          <code>[REDACTED_SECRET]</code>. The offline capture spool applies the same redaction and is private to your
          user. Pattern matching catches common formats, not every secret, so keep secrets out of prompts when you can.
        </p>

        <h2>Export and deletion</h2>
        <p>
          <code>memory_export</code> and <code>GET /agentmemory/export</code> return everything stored.{" "}
          <code>memory_governance_delete</code> deletes records and keeps an audit entry of the deletion. Deleted
          observations stay deleted after a restart or a replayed event.
        </p>

        <h2>Supply chain</h2>
        <ul>
          <li>
            The iii engine is pinned to one version (<code>0.22.1</code>). The installer checks the downloaded archive
            against a SHA-256 recorded in the package before it extracts it.
          </li>
          <li>
            The engine starts with update checks off and its anonymous usage telemetry off (
            <code>III_TELEMETRY_ENABLED=false</code>), unless you set that variable yourself.
          </li>
          <li>
            Every pull request and push to main runs the{" "}
            <a href={GATE_SOURCE}>release gate</a> on Ubuntu and macOS (<a href={GATE_WORKFLOW}>workflow</a>): CI packs the
            npm tarball, installs it into an empty directory and checks capture, MCP, crash recovery and export round
            trips against the installed artifact.
          </li>
        </ul>

        <h2>What is not done</h2>
        <ul>
          <li>Stored memory is not encrypted at rest. File permissions on your account are what protect it.</li>
          <li>
            The iii console does not enforce auth. Keep it on 127.0.0.1, which is the default, and never expose it.
          </li>
          <li>
            Binding to anything other than 127.0.0.1 makes the API reachable from your network. Auth stays on, but only do
            it on networks you trust.
          </li>
        </ul>

        <h2>Report a vulnerability</h2>
        <p>
          Please report privately through{" "}
          <a href={`${REPO_URL}/security/advisories/new`}>GitHub security advisories</a> rather than a public issue.
        </p>
      </Prose>
      <Durability />
    </DocPage>
  );
}
