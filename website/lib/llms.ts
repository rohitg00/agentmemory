import "server-only";
import { COMPETITORS } from "./compare";
import {
  AGENTS,
  AGENT_INSTALL_PROMPT,
  FAQ,
  GATE_SCENARIOS,
  INSTALL_CMD,
  REPO_URL,
  SITE_URL,
  src,
} from "./site";
import { MCP_JSON } from "./rest";
import { EVALUATION, percent } from "./bench";
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
  return [
    "# agentmemory",
    "",
    SUMMARY,
    "",
    `Version ${m.version}. ${m.mcpTools} MCP tools, ${m.hooks} capture hooks, ${m.restEndpoints} REST endpoints, ${m.testCases} test cases in the suite. Website: ${SITE_URL}. Source: ${REPO_URL}.`,
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
    "3. Index. BM25 indexes keywords by default. Optional local or remote embeddings add vector retrieval.",
    "4. Summarize. Session summaries process new observations incrementally. Optional consolidation creates source-linked memories.",
    "5. Recall. Connected integrations retrieve context when injection is enabled. MCP and REST also support explicit recall.",
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
    `2026-10-28 LongMemEval-S: 500 questions per adapter, 470 answerable, 30 excluded from retrieval metrics. BM25 component strict recall-all@5 ${percent(EVALUATION.longmemeval.byAdapter["agentmemory-bm25-component"].recallAll)}; grep ${percent(EVALUATION.longmemeval.byAdapter.grep.recallAll)}. Zero execution failures.`,
    "The metric requires every gold source among five distinct sessions. This component run excludes the daemon, embeddings, compression and answer generation. It is not a competitor ranking or release-to-release speed comparison.",
    "Coding fixture: BM25 14/15, grep 15/15 strict successes. Both completed all cases.",
    `Methodology and receipts: ${src.longmemeval}`,
    "",
    "Release gate: every publish installs the packed package and runs these scenarios against it:",
    "",
    ...GATE_SCENARIOS.map((g) => `- ${g.id}: ${g.what}`),
    "",
    "## Privacy and security",
    "",
    "- Memories and captured activity are stored in the local data directory on the user's machine (~/Library/Application Support/agentmemory on macOS, $XDG_DATA_HOME/agentmemory or ~/.local/share/agentmemory on Linux, %APPDATA%\\agentmemory on Windows). ~/.agentmemory holds configuration and the generated secret. There is no account, no hosted service and no telemetry.",
    "- Memory text stays local with keyless search or local models. Configured remote services receive the text they process. Installation, updates and first-use model downloads need network access.",
    "- The REST API requires a bearer token by default. A secret is generated into ~/.agentmemory/secret on first start when AGENTMEMORY_SECRET is unset.",
    "- The CLI's local REST and viewer listeners bind to 127.0.0.1 by default; the engine WebSocket is internal runtime traffic.",
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
