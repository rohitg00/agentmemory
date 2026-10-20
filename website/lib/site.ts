export const SITE_URL = "https://agent-memory.dev";
export const REPO = "rohitg00/agentmemory";
export const REPO_URL = `https://github.com/${REPO}`;
export const NPM_URL = "https://www.npmjs.com/package/@agentmemory/agentmemory";
export const DOCS_URL = "/docs";
export const INSTALL_CMD = "npx -y @agentmemory/agentmemory@latest";
export const AGENT_INSTALL_PROMPT =
  "Retrieve and follow the instructions at: https://raw.githubusercontent.com/rohitg00/agentmemory/main/INSTALL_FOR_AGENTS.md";

export const src = {
  longmemeval: `${REPO_URL}/blob/main/benchmark/LONGMEMEVAL.md`,
  tokens: `${REPO_URL}/blob/main/benchmark/REAL-EMBEDDINGS.md`,
  agentLife: `${REPO_URL}/blob/main/docs/benchmarks/2026-05-20-coding-agent-life-v1.md`,
  gate: `${REPO_URL}/tree/main/scripts/release-gate`,
  costs: `${REPO_URL}/blob/main/docs/benchmarks/capture-costs.svg`,
  stars: `${REPO_URL}/stargazers`,
  contributors: `${REPO_URL}/graphs/contributors`,
  releases: `${REPO_URL}/releases`,
  npm: NPM_URL,
  license: `${REPO_URL}/blob/main/LICENSE`,
  changelog: `${REPO_URL}/blob/main/CHANGELOG.md`,
  paper: "https://arxiv.org/abs/2410.10813",
  dataset: "https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned",
  wiki: "https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2",
};

export const NAV = [
  { label: "Use cases", href: "/#use-cases" },
  { label: "How it works", href: "/#how" },
  { label: "Benchmarks", href: "/benchmarks" },
  { label: "Security", href: "/security" },
  { label: "Docs", href: DOCS_URL },
];

export type Support = "plugin" | "mcp" | "rest";

export interface Agent {
  name: string;
  logo: string;
  href: string;
  support: Support;
  detail: string;
  connect?: string;
}

export const AGENTS: Agent[] = [
  { name: "Claude Code", logo: "https://github.com/anthropics.png", href: "https://claude.com/product/claude-code", support: "plugin", detail: "12 hooks, MCP, skills", connect: "claude-code" },
  { name: "Codex CLI", logo: "https://github.com/openai.png", href: "https://github.com/openai/codex", support: "plugin", detail: "6 hooks, MCP", connect: "codex" },
  { name: "Copilot CLI", logo: "https://svgl.app/library/github_dark.svg", href: "https://docs.github.com/copilot/github-copilot-in-the-cli", support: "plugin", detail: "plugin hooks, skills, MCP", connect: "copilot-cli" },
  { name: "Cursor", logo: "https://svgl.app/library/cursor_dark.svg", href: `${REPO_URL}/tree/main/.cursor-plugin`, support: "plugin", detail: "7 hooks, 17 skills, MCP", connect: "cursor" },
  { name: "OpenCode", logo: "/opencode.png", href: `${REPO_URL}/tree/main/plugin/opencode`, support: "plugin", detail: "capture plugin, MCP", connect: "opencode" },
  { name: "Devin", logo: "/devin.png", href: "https://devin.ai", support: "plugin", detail: "6 hooks, skills, MCP", connect: "devin" },
  { name: "OpenClaw", logo: "https://github.com/openclaw.png", href: "https://github.com/openclaw/openclaw", support: "plugin", detail: "gateway plugin, MCP", connect: "openclaw" },
  { name: "Hermes", logo: "https://github.com/NousResearch.png", href: "https://github.com/NousResearch", support: "plugin", detail: "Python plugin, MCP", connect: "hermes" },
  { name: "pi", logo: "https://raw.githubusercontent.com/rohitg00/agentmemory/main/assets/agents/pi.svg", href: `${REPO_URL}/tree/main/integrations/pi`, support: "plugin", detail: "native plugin, MCP", connect: "pi" },
  { name: "OpenHuman", logo: "https://raw.githubusercontent.com/tinyhumansai/openhuman/main/app/src-tauri/icons/128x128.png", href: "https://github.com/tinyhumansai/openhuman", support: "plugin", detail: "native Memory backend", connect: "openhuman" },
  { name: "Gemini CLI", logo: "https://github.com/google-gemini.png", href: "https://github.com/google-gemini/gemini-cli", support: "mcp", detail: "MCP server", connect: "gemini-cli" },
  { name: "Antigravity", logo: "https://svgl.app/library/antigravity.svg", href: "https://antigravity.google", support: "mcp", detail: "MCP, hooks", connect: "antigravity" },
  { name: "Claude Desktop", logo: "https://github.com/anthropics.png", href: "https://claude.ai/download", support: "mcp", detail: "MCP server" },
  { name: "Warp", logo: "https://svgl.app/library/warp.svg", href: "https://www.warp.dev", support: "mcp", detail: "MCP server", connect: "warp" },
  { name: "Zed", logo: "https://svgl.app/library/zed-logo_dark.svg", href: "https://zed.dev", support: "mcp", detail: "MCP server", connect: "zed" },
  { name: "Cline", logo: "https://github.com/cline.png", href: "https://github.com/cline/cline", support: "mcp", detail: "MCP server", connect: "cline" },
  { name: "Continue", logo: "https://github.com/continuedev.png", href: "https://continue.dev", support: "mcp", detail: "MCP server", connect: "continue" },
  { name: "Droid", logo: "https://www.factory.ai/favicon.svg", href: "https://docs.factory.ai/cli", support: "mcp", detail: "MCP server", connect: "droid" },
  { name: "Kiro", logo: "https://kiro.dev/favicon.ico", href: "https://kiro.dev", support: "mcp", detail: "MCP server", connect: "kiro" },
  { name: "Qwen Code", logo: "https://svgl.app/library/qwen_dark.svg", href: "https://github.com/QwenLM/qwen-code", support: "mcp", detail: "MCP server", connect: "qwen" },
  { name: "DeepSeek Harness", logo: "https://svgl.app/library/deepseek.svg", href: "https://github.com/deepseek-ai/deepseek-harness", support: "mcp", detail: "MCP server", connect: "dsh" },
  { name: "Roo Code", logo: "https://github.com/RooCodeInc.png", href: "https://github.com/RooCodeInc/Roo-Code", support: "mcp", detail: "MCP server" },
  { name: "Kilo Code", logo: "https://github.com/Kilo-Org.png", href: "https://github.com/Kilo-Org/kilocode", support: "mcp", detail: "MCP server" },
  { name: "Goose", logo: "https://github.com/block.png", href: "https://github.com/block/goose", support: "mcp", detail: "MCP server" },
  { name: "Aider", logo: "https://github.com/Aider-AI.png", href: "https://github.com/Aider-AI/aider", support: "rest", detail: "REST API" },
];

export const LONGMEMEVAL = {
  questions: 500,
  hybrid: { r5: 95.2, r10: 98.6, r20: 99.4, ndcg10: 87.9, mrr: 88.2 },
  bm25: { r5: 86.2, r10: 94.6, r20: 98.6, ndcg10: 73.0, mrr: 71.5 },
  byType: [
    { type: "knowledge-update", count: 78, r5: 98.7, r10: 100.0, h5: 77, h10: 78 },
    { type: "multi-session", count: 133, r5: 97.7, r10: 100.0, h5: 130, h10: 133 },
    { type: "single-session-assistant", count: 56, r5: 96.4, r10: 98.2, h5: 54, h10: 55 },
    { type: "temporal-reasoning", count: 133, r5: 95.5, r10: 97.7, h5: 127, h10: 130 },
    { type: "single-session-user", count: 70, r5: 90.0, r10: 97.1, h5: 63, h10: 68 },
    { type: "single-session-preference", count: 30, r5: 83.3, r10: 96.7, h5: 25, h10: 29 },
  ],
  embedding: "all-MiniLM-L6-v2, 384 dimensions, local",
};

export const TOKENS = { fullContext: 19462, agentmemory: 1571, savedPct: 92 };

export const GATE_SCENARIOS = [
  { id: "install", what: "The packed artifact installs and reports its identity" },
  { id: "capture", what: "Bundled hooks capture, and search finds every marker" },
  { id: "mcp", what: "Installed MCP entrypoints list tools and save and search through the server" },
  { id: "offline", what: "Hooks run while the service is down, and the spool is recovered on restart" },
  { id: "dedup", what: "A replayed host event after a force kill stays one observation" },
  { id: "deadletter", what: "A capture that fails processing survives a restart as a dead letter" },
  { id: "vectors", what: "Vectors made before the first checkpoint survive a crash" },
  { id: "stopflush", what: "agentmemory stop, then start, loses nothing" },
  { id: "status", what: "The viewer serves and /agentmemory/status explains every problem" },
  { id: "roundtrip", what: "Export, then import into a fresh home, round-trips" },
];

export const FEATURED = [
  { name: "OpenUK", sub: "AI Openness 2026 case study", href: "https://openuk.uk/report/aiopenness2026/" },
  { name: "AlphaSignal", sub: "Technical deep-dive, 180K subscribers", href: "https://alphasignalai.substack.com/p/how-agentmemory-works-and-how-to" },
  { name: "Agentic AI Foundation", sub: "Linux Foundation backed", href: "https://aaif.io/" },
  {
    name: "Trendshift",
    sub: "Trending repository",
    href: "https://trendshift.io/repositories/25123?utm_source=repository-badge&utm_medium=badge&utm_campaign=badge-repository-25123",
    badge: {
      light: "https://trendshift.io/api/badge/repositories/25123",
      dark: "https://trendshift.io/api/badge/repositories/25123",
      alt: "rohitg00/agentmemory on Trendshift",
    },
  },
  {
    name: "Trendshift weekly",
    sub: "#1 Repository of the Week, TypeScript",
    href: "https://trendshift.io/repositories/25123",
    badge: {
      light: "https://trendshift.io/api/badge/trendshift/repositories/25123/weekly?language=TypeScript",
      dark: "https://trendshift.io/api/badge/trendshift/repositories/25123/weekly?language=TypeScript",
      alt: "agentmemory, #1 TypeScript Repository of the Week on Trendshift",
    },
  },
  {
    name: "Trendshift monthly",
    sub: "#5 Repository of the Month, TypeScript",
    href: "https://trendshift.io/repositories/25123",
    badge: {
      light: "https://trendshift.io/api/badge/trendshift/repositories/25123/monthly?language=TypeScript",
      dark: "https://trendshift.io/api/badge/trendshift/repositories/25123/monthly?language=TypeScript",
      alt: "agentmemory, #5 TypeScript Repository of the Month on Trendshift",
    },
  },
  {
    name: "Product Hunt",
    sub: "#2 Product of the Day",
    href: "https://www.producthunt.com/products/agent-memory-dev/launches/agentmemory?embed=true&utm_source=badge-top-post-badge&utm_medium=badge&utm_campaign=badge-agentmemory",
    badge: {
      light: "https://api.producthunt.com/widgets/embed-image/v1/top-post-badge.svg?post_id=1144164&theme=light&period=daily",
      dark: "https://api.producthunt.com/widgets/embed-image/v1/top-post-badge.svg?post_id=1144164&theme=dark&period=daily",
      alt: "agentmemory, #2 Product of the Day on Product Hunt",
    },
  },
];

const PH = "https://www.producthunt.com/p/agent-memory-dev/how-do-you-found-agentmemory-so-far-happy-to-help";

export const QUOTES = [
  { name: "Peter Neyra", context: "Backfilled a month of Cursor transcripts", quote: "I backfilled agent memory on my past month's Cursor agent transcripts. It was surprisingly accurate. Picked up on things that I moved away from.", href: `${PH}?comment=5379518` },
  { name: "Alper Tayfur", context: "Product Hunt launch thread", quote: "Tackles one of the biggest pain points with coding agents: losing useful project context across sessions without bloating the context window.", href: PH },
  { name: "Thomas Hall", context: "Product Hunt launch thread", quote: "Memory often becomes just more noise over time. Agentmemory feels more intentional compared to a lot of tools in this space.", href: PH },
  { name: "Pranav Prakash", context: "Two weeks of daily use", quote: "Been using it for 2 weeks, and I definitely see improvements.", href: PH },
];

export interface Paper {
  title: string;
  authors: string;
  venue: string;
  date: string;
  href: string;
  cites: "LLM Wiki v2" | "agentmemory";
  quote?: string;
  note?: string;
}

export const RESEARCH: Paper[] = [
  {
    title: "Memory as Metabolism: A Design for Companion Knowledge Systems",
    authors: "Stefan Miteski",
    venue: "arXiv 2604.12034",
    date: "Apr 2026",
    href: "https://arxiv.org/abs/2604.12034",
    cites: "LLM Wiki v2",
    quote: "This is the closest practitioner-level prior art to the governance profile this paper proposes.",
  },
  {
    title: "The Missing Knowledge Layer in Cognitive Architectures for AI Agents",
    authors: "Michaël Roynard",
    venue: "arXiv 2604.11364",
    date: "Apr 2026",
    href: "https://arxiv.org/abs/2604.11364",
    cites: "LLM Wiki v2",
    quote: "Closest informal statement of the four-layer thesis.",
  },
  {
    title: "Managed Memory Is Still Not Governed State: Production Lessons from LLM Wiki v2",
    authors: "Peter Bell",
    venue: "Zenodo 19545947",
    date: "Apr 2026",
    href: "https://doi.org/10.5281/zenodo.19545947",
    cites: "LLM Wiki v2",
    quote: "Karpathy’s original pattern gives compiled memory. LLM Wiki v2 gives managed memory.",
  },
  {
    title: "Beyond Memory: A Templated Substrate for Heterogeneous Collaborative Knowledge Work with LLM Agents",
    authors: "Priscila Saboia Moreira, Christopher R. Sweet",
    venue: "arXiv 2607.24759",
    date: "May 2026",
    href: "https://arxiv.org/abs/2607.24759",
    cites: "LLM Wiki v2",
    quote: "LLM Wiki v2 (rohitg00, 2026) adds confidence scoring and explicit supersession of stale claims by higher-confidence successor pages.",
  },
  {
    title: "TOKI: A Bitemporal Operator Algebra for Contradiction Resolution in LLM-Agent Persistent Memory",
    authors: "Ziming Wang",
    venue: "arXiv 2606.06240",
    date: "Jun 2026",
    href: "https://arxiv.org/abs/2606.06240",
    cites: "agentmemory",
    note: "Cites agentmemory v0.9.17 and names it as a future integration for testing the paper’s contradiction predicates.",
  },
];

export const FAQ = [
  {
    q: "What does agentmemory actually store?",
    a: "Observations from your agent's sessions: the prompts you typed, the tools it called and a bounded copy of their output, and the session summaries built from them. Consolidation turns related observations into memories, lessons and graph facts. Everything lives in a data folder on your machine, for example ~/Library/Application Support/agentmemory on macOS.",
  },
  {
    q: "Does anything leave my machine?",
    a: "Not by default. With no provider configured, recall runs on BM25 keyword search and nothing is sent anywhere. If you add an LLM or an embedding provider, agentmemory sends that provider the text it needs. Local embeddings send nothing. There is no telemetry.",
  },
  {
    q: "Do I need an API key?",
    a: "No. Keyless mode works out of the box with BM25 recall. Set EMBEDDING_PROVIDER=local for free on-device semantic recall, or add a provider key for LLM consolidation.",
  },
  {
    q: "Which agents does it work with?",
    a: "Any MCP client. Claude Code, Codex CLI, Copilot CLI, Cursor, OpenCode, Devin and others get native plugins with hooks that capture automatically. Run agentmemory connect <agent> to wire one.",
  },
  {
    q: "What happens if the server crashes mid-session?",
    a: "Hooks write to an offline spool while the server is down and drain it when it comes back. Each event has a restart-safe id, so replays are stored once. Vectors survive a crash through a pending log. Every publish runs a release gate that force-kills the installed package and checks nothing was lost.",
  },
  {
    q: "How is it licensed?",
    a: "Apache-2.0. The whole runtime is open source, including the parts that run on your machine. There is no hosted tier and no feature held back.",
  },
];
