import "server-only";
import { COMPETITORS } from "./compare";
import {
  AGENTS,
  AGENT_INSTALL_PROMPT,
  FAQ,
  GATE_SCENARIOS,
  INSTALL_CMD,
  LONGMEMEVAL,
  REPO_URL,
  SITE_URL,
  TOKENS,
  src,
} from "./site";
import { MCP_JSON } from "./rest";
import { getProjectMeta } from "./meta";

const SUMMARY =
  "agentmemory is open-source persistent memory for AI coding agents. Hooks capture what an agent does during a session, the local server stores and indexes it on the user's machine, and the next session starts with the relevant memories already in context. It runs locally with no account and no API key, and is licensed Apache-2.0.";

export function llmsTxt(): string {
  const m = getProjectMeta();
  return [
    "# agentmemory",
    "",
    `> ${SUMMARY}`,
    "",
    `Current version: ${m.version}. Install: \`${INSTALL_CMD}\`.`,
    "",
    "## Pages",
    "",
    `- [Home](${SITE_URL}/): what agentmemory does and how it works`,
    `- [Benchmarks](${SITE_URL}/benchmarks): retrieval recall and token cost, with methodology`,
    `- [Security](${SITE_URL}/security): what runs where, auth, and how to report a vulnerability`,
    `- [Privacy](${SITE_URL}/privacy): what is stored and what leaves the machine`,
    `- [Changelog](${SITE_URL}/changelog): every release`,
    `- [Compare](${SITE_URL}/vs): agentmemory side by side with other memory tools, with sources`,
    ...COMPETITORS.map((c) => `- [agentmemory vs ${c.name}](${SITE_URL}/vs/${c.slug})`),
    "",
    "## Docs",
    "",
    `- [Documentation](${SITE_URL}/docs)`,
    `- [README](${REPO_URL}/blob/main/README.md): full reference, configuration and API`,
    `- [INSTALL_FOR_AGENTS.md](${REPO_URL}/blob/main/INSTALL_FOR_AGENTS.md): step-by-step install instructions written for coding agents`,
    "",
    "## Optional",
    "",
    `- [llms-full.txt](${SITE_URL}/llms-full.txt): the whole site as plain text`,
    `- [Source code](${REPO_URL})`,
    `- [npm package](${src.npm})`,
    "",
  ].join("\n");
}

export function llmsFullTxt(): string {
  const m = getProjectMeta();
  const plugins = AGENTS.filter((a) => a.support === "plugin");
  const others = AGENTS.filter((a) => a.support !== "plugin");
  const agentLine = (a: (typeof AGENTS)[number]) =>
    `- ${a.name}: ${a.detail}${a.connect ? `. Wire it with \`agentmemory connect ${a.connect}\`` : ""}`;
  const h = LONGMEMEVAL.hybrid;
  const b = LONGMEMEVAL.bm25;
  return [
    "# agentmemory",
    "",
    SUMMARY,
    "",
    `Version ${m.version}. ${m.mcpTools} MCP tools, ${m.hooks} capture hooks, ${m.restEndpoints} REST endpoints, ${m.testsPassing.toLocaleString("en-US")} tests. Website: ${SITE_URL}. Source: ${REPO_URL}.`,
    "",
    "## Install",
    "",
    "Requires Node.js 20 or newer.",
    "",
    `1. Start the memory server: \`${INSTALL_CMD}\`. The first run installs the pinned engine, starts the server on port 3111 and the viewer on port 3113, and asks which agents to wire.`,
    "2. Wire another agent at any time: `agentmemory connect <agent>`. Add `--with-hooks` for automatic capture where the agent supports it.",
    `3. Or hand a coding agent this instruction: "${AGENT_INSTALL_PROMPT}"`,
    "",
    "Any other MCP client: merge this entry into its mcpServers object. With no variables set it talks to http://localhost:3111.",
    "",
    "```json",
    MCP_JSON,
    "```",
    "",
    "## How it works",
    "",
    "1. Capture. Hooks fire on every prompt and tool call. Each event is posted to the local server on port 3111 with a restart-safe id, or spooled to disk if the server is down.",
    "2. Store. Each event becomes an observation in the local data directory: the tool, the file, a bounded copy of the output, and the session it came from. The data directory is ~/Library/Application Support/agentmemory on macOS, $XDG_DATA_HOME/agentmemory or ~/.local/share/agentmemory on Linux, and %APPDATA%\\agentmemory on Windows; AGENTMEMORY_DATA_DIR overrides it.",
    "3. Index. Observations are indexed twice: BM25 terms for exact words and vectors for meaning. Local embeddings work with no API key.",
    "4. Consolidate. When the session ends, related observations collapse into memories that keep links back to every observation they came from.",
    "5. Recall. The next session opens with the relevant memories already in context.",
    "",
    "## Agents",
    "",
    `Native plugins (${plugins.length}), where hooks capture automatically:`,
    "",
    ...plugins.map(agentLine),
    "",
    `MCP and REST (${others.length}):`,
    "",
    ...others.map(agentLine),
    "",
    "## Benchmarks",
    "",
    `LongMemEval-S, ${LONGMEMEVAL.questions} questions, retrieval recall (does a gold session appear in the top K results). Embedding model: ${LONGMEMEVAL.embedding}. No LLM in the loop. This measures retrieval, not end-to-end question answering accuracy.`,
    "",
    `- BM25 plus vectors: recall@5 ${h.r5}%, recall@10 ${h.r10}%, recall@20 ${h.r20}%, NDCG@10 ${h.ndcg10}%, MRR ${h.mrr}%`,
    `- BM25 only (keyless): recall@5 ${b.r5}%, recall@10 ${b.r10}%, recall@20 ${b.r20}%, NDCG@10 ${b.ndcg10}%, MRR ${b.mrr}%`,
    `- Source and reproduction steps: ${src.longmemeval}`,
    "",
    `Token cost: recalling from agentmemory used ${TOKENS.agentmemory.toLocaleString("en-US")} tokens where loading the full history used ${TOKENS.fullContext.toLocaleString("en-US")}, about ${TOKENS.savedPct}% fewer, measured on v0.6.0. Source: ${src.tokens}`,
    "",
    "Release gate: every publish installs the packed package and runs these scenarios against it:",
    "",
    ...GATE_SCENARIOS.map((g) => `- ${g.id}: ${g.what}`),
    "",
    "## Privacy and security",
    "",
    "- Memories and captured activity are stored in the local data directory on the user's machine (~/Library/Application Support/agentmemory on macOS, $XDG_DATA_HOME/agentmemory or ~/.local/share/agentmemory on Linux, %APPDATA%\\agentmemory on Windows). ~/.agentmemory holds configuration and the generated secret. There is no account, no hosted service and no telemetry.",
    "- Nothing leaves the machine unless the user configures an LLM or embedding provider; then that provider receives the text it needs. Local embeddings send nothing.",
    "- The REST API requires a bearer token by default. A secret is generated into ~/.agentmemory/secret on first start when AGENTMEMORY_SECRET is unset.",
    "- The bundled engine config binds to 127.0.0.1.",
    `- Report vulnerabilities privately through GitHub Security Advisories, as described in ${REPO_URL}/blob/main/SECURITY.md`,
    "",
    "## FAQ",
    "",
    ...FAQ.flatMap((f) => [`### ${f.q}`, "", f.a, ""]),
    "## Links",
    "",
    `- Benchmarks: ${SITE_URL}/benchmarks`,
    `- Security: ${SITE_URL}/security`,
    `- Privacy: ${SITE_URL}/privacy`,
    `- Changelog: ${SITE_URL}/changelog`,
    `- Compare: ${SITE_URL}/vs`,
    `- Docs: ${SITE_URL}/docs`,
    `- npm: ${src.npm}`,
    "",
  ].join("\n");
}
