import { LONGMEMEVAL, REPO_URL } from "@/lib/site";

export const CHECKED_ON = "2026-10-05";

export type RowKey =
  | "what"
  | "license"
  | "deployment"
  | "storage"
  | "capture"
  | "integrations"
  | "retrieval"
  | "benchmarks"
  | "pricing";

export const ROWS: { key: RowKey; label: string }[] = [
  { key: "what", label: "What it is" },
  { key: "license", label: "License" },
  { key: "deployment", label: "Where it runs" },
  { key: "storage", label: "What it needs" },
  { key: "capture", label: "How memory is captured" },
  { key: "integrations", label: "Agent integrations" },
  { key: "retrieval", label: "Retrieval" },
  { key: "benchmarks", label: "Published benchmarks" },
  { key: "pricing", label: "Pricing" },
];

export interface Fact {
  value: string;
  src?: string;
}

export interface Competitor {
  slug: string;
  name: string;
  tagline: string;
  links: { home: string; docs: string; github?: string };
  rows: Record<RowKey, Fact>;
  summary: string;
  differ: string[];
  chooseThem: string[];
  chooseUs: string[];
  moving?: string[];
}

const README = `${REPO_URL}#readme`;

export const AGENTMEMORY: Record<RowKey, Fact> = {
  what: {
    value: "Local memory server for coding agents. Hooks capture each session, and memory comes back through hooks and MCP in the next one.",
    src: README,
  },
  license: { value: "Apache-2.0", src: `${REPO_URL}/blob/main/LICENSE` },
  deployment: {
    value: "On your machine, as one process bound to 127.0.0.1. There is no hosted tier.",
    src: README,
  },
  storage: {
    value: "Nothing to install. State lives in a local data folder. Redis is optional.",
    src: README,
  },
  capture: {
    value: "Automatic. Lifecycle hooks record prompts, tool calls and session ends, so there are no add() calls to write.",
    src: README,
  },
  integrations: {
    value: "25 agents, with native plugins for Claude Code, Codex CLI, Copilot CLI, Cursor and others, 54 MCP tools and a REST API.",
    src: `${REPO_URL}#works-with-every-agent`,
  },
  retrieval: {
    value: "BM25, local vectors and a knowledge graph, fused into one ranking. Works keyless on BM25 alone.",
    src: README,
  },
  benchmarks: {
    value: `LongMemEval-S retrieval recall at 5: ${LONGMEMEVAL.hybrid.r5}%. This measures retrieval only, not answer accuracy.`,
    src: `${REPO_URL}/blob/main/benchmark/LONGMEMEVAL.md`,
  },
  pricing: {
    value: "Free. If you add an LLM or embedding provider, that usage is billed by the provider.",
    src: README,
  },
};

const MEM0_GH = "https://github.com/mem0ai/mem0";
const SM_GH = "https://github.com/supermemoryai/supermemory";
const SM_SELF = "https://supermemory.ai/docs/self-hosting/overview";
const GRAPHITI_GH = "https://github.com/getzep/graphiti";
const CM_GH = "https://github.com/thedotmack/claude-mem";
const LETTA_DOCS = "https://docs.letta.com/";
const COGNEE_GH = "https://github.com/topoteretes/cognee";

export const COMPETITORS: Competitor[] = [
  {
    slug: "mem0",
    name: "Mem0",
    tagline: "A memory layer you call from your own agent or app, as a library or a managed platform.",
    links: { home: "https://mem0.ai", docs: "https://docs.mem0.ai", github: MEM0_GH },
    rows: {
      what: { value: "Memory layer for AI agents and apps, offered as an open source library and a managed platform.", src: MEM0_GH },
      license: { value: "Apache-2.0", src: MEM0_GH },
      deployment: { value: "Managed cloud platform, a self-hosted server, or a library inside your app.", src: MEM0_GH },
      storage: { value: "An LLM (OpenAI gpt-5-mini by default) and a vector store. The platform hosts both for you.", src: MEM0_GH },
      capture: { value: "Explicit. Your code calls memory.add() with messages, and an LLM extracts memories from them.", src: MEM0_GH },
      integrations: { value: "Python and TypeScript SDKs, an MCP integration, OpenMemory, and an agent skill for Claude Code.", src: "https://mem0.ai" },
      retrieval: { value: "Multi-signal retrieval over extracted memories. Graph memory is on the Pro and Enterprise plans.", src: "https://mem0.ai/pricing" },
      benchmarks: {
        value: "Their published scores: LoCoMo 92.5, LongMemEval 94.4, BEAM (1M) 64.1. Measured with their own harness and metric, so not comparable to retrieval recall.",
        src: MEM0_GH,
      },
      pricing: { value: "Hobby free (10,000 adds and 1,000 retrievals a month), Starter $19, Pro $249, Enterprise custom.", src: "https://mem0.ai/pricing" },
    },
    summary:
      "Mem0 is a memory API you build into your own application. agentmemory is a memory server for coding agents that captures sessions on its own and runs entirely on your machine.",
    differ: [
      "Mem0 is called by your code: you decide what to send with memory.add(), and an LLM turns it into memories. That suits products where you own the agent loop. agentmemory sits beside agents you already use, like Claude Code or Cursor, and captures their sessions through hooks without code changes.",
      "Mem0 needs an LLM to extract memories and a vector store to hold them, or its managed platform. agentmemory runs as one local process with no external database, and works without any API key on BM25 search.",
      "Some Mem0 capabilities, such as graph memory, on-prem deployment and audit logs, sit on paid plans. agentmemory has no paid tier, so every feature ships in the open source build.",
    ],
    chooseThem: [
      "You are building your own agent or app and want a memory API with Python and TypeScript SDKs.",
      "You want a managed platform with a dashboard and compliance paperwork.",
      "You are happy to choose what gets remembered with explicit add() calls.",
    ],
    chooseUs: [
      "You use existing coding agents and want memory captured without writing code.",
      "You want everything on your machine, with no account and no external database.",
      "You switch between agents and want one memory shared by all of them.",
    ],
  },
  {
    slug: "supermemory",
    name: "supermemory",
    tagline: "A hosted memory and context API with plugins, MCP and framework wrappers.",
    links: { home: "https://supermemory.ai", docs: "https://supermemory.ai/docs", github: SM_GH },
    rows: {
      what: { value: "Memory and context engine for AI, served through a hosted API, plugins and MCP.", src: SM_GH },
      license: {
        value: "MIT for the public repository. Their docs state the self-hosted server binary is built from a separate, non-public codebase.",
        src: SM_SELF,
      },
      deployment: { value: "Hosted API by default. A self-hosted server binary is also available.", src: SM_SELF },
      storage: { value: "Managed by the hosted service. Self-hosting requirements are listed in their docs.", src: SM_SELF },
      capture: { value: "Server-side. Content sent through the API, plugins or MCP is extracted into memories.", src: SM_GH },
      integrations: {
        value: "MCP, a Claude Code plugin, TypeScript and Python SDKs, and wrappers for Vercel AI SDK, LangChain, LangGraph, OpenAI Agents SDK, Mastra and more.",
        src: SM_GH,
      },
      retrieval: { value: "Search over extracted memories and documents through the hosted API.", src: SM_GH },
      benchmarks: {
        value: "They report #1 on LongMemEval (95% recall at 15), LoCoMo and ConvoMem. Recall at 15 is a looser cutoff than recall at 5.",
        src: SM_GH,
      },
      pricing: { value: "Free with $5 of monthly credits, Pro $19, Max $100, Scale $399, Enterprise custom.", src: "https://supermemory.ai/pricing" },
    },
    summary:
      "supermemory is a hosted memory API with broad framework support. agentmemory is an open source server that runs on your machine and captures coding agent sessions directly.",
    differ: [
      "supermemory runs as a hosted service you send content to, and it extracts memories on its side. agentmemory runs locally, and hooks in your coding agent write to it on your machine.",
      "According to their self-hosting docs, the downloadable server is built from a non-public codebase, collects telemetry unless SUPERMEMORY_DISABLE_TELEMETRY=1 is set, and still calls a hosted reader for URL ingestion. agentmemory is open source end to end and sends nothing anywhere unless you add a provider.",
      "supermemory has wrappers for many app frameworks, which suits product teams. agentmemory focuses on coding agents, with native plugins and hooks for the tools developers already run.",
    ],
    chooseThem: [
      "You want a managed API and do not want to run anything yourself.",
      "You build on Vercel AI SDK, LangChain, Mastra or similar and want a drop-in wrapper.",
      "You need memory and document retrieval for an end-user product.",
    ],
    chooseUs: [
      "You want the whole engine open source and auditable.",
      "You want zero network calls by default, with no telemetry to switch off.",
      "Your main use is coding agents like Claude Code, Codex or Cursor.",
    ],
  },
  {
    slug: "zep",
    name: "Zep",
    tagline: "An enterprise context layer built on Graphiti, an open source temporal knowledge graph.",
    links: { home: "https://www.getzep.com", docs: "https://help.getzep.com", github: GRAPHITI_GH },
    rows: {
      what: {
        value: "Context layer for enterprise agents that unifies business data, documents and conversations. Built on Graphiti, its open source temporal knowledge graph.",
        src: "https://www.getzep.com",
      },
      license: { value: "Zep is a commercial service. Graphiti is Apache-2.0.", src: GRAPHITI_GH },
      deployment: { value: "Zep Cloud, with bring-your-own-keys and bring-your-own-cloud options. Graphiti runs wherever you host it.", src: "https://www.getzep.com" },
      storage: { value: "Graphiti needs a graph database (Neo4j, FalkorDB or Amazon Neptune) and an LLM that supports structured output.", src: GRAPHITI_GH },
      capture: { value: "Explicit. Your application sends conversations and data to Zep, or adds them to Graphiti through its API.", src: GRAPHITI_GH },
      integrations: { value: "A memory MCP server for Zep. Graphiti ships its own MCP server.", src: "https://www.getzep.com" },
      retrieval: { value: "Hybrid semantic, BM25 keyword and graph traversal over a temporal knowledge graph.", src: GRAPHITI_GH },
      benchmarks: {
        value: "Their published scores: LoCoMo 94.7% and LongMemEval 90.2% accuracy, with 155 to 162 ms retrieval latency. Answer accuracy, not retrieval recall.",
        src: "https://www.getzep.com",
      },
      pricing: { value: "10,000 free credits a month, Flex $125 a month, Flex Plus $375 a month, Enterprise custom.", src: "https://www.getzep.com/pricing/" },
    },
    summary:
      "Zep is a managed context platform for enterprise agents, built on the Graphiti graph engine. agentmemory is a local memory server for individual developers and their coding agents.",
    differ: [
      "Zep centers on a temporal knowledge graph that combines business data, documents and conversations for many users. agentmemory centers on one developer's coding sessions, captured automatically on their machine.",
      "Running Graphiti yourself means operating a graph database and an LLM for ingestion. agentmemory needs neither: it runs as one process, and its own graph is built locally and optionally.",
      "Zep's platform adds enterprise controls such as SOC 2 Type II and bring-your-own-cloud. agentmemory avoids that surface by not hosting anything, since data never leaves the machine.",
    ],
    chooseThem: [
      "You need governed, shared context across many users and business systems.",
      "You want a managed graph platform with enterprise compliance.",
      "You are already invested in Neo4j or Neptune and want Graphiti on top.",
    ],
    chooseUs: [
      "You want memory for your own coding agents without running a graph database.",
      "You want capture to happen through hooks, with no integration code.",
      "You want it free and local, with nothing to provision.",
    ],
  },
  {
    slug: "claude-mem",
    name: "claude-mem",
    tagline: "A memory plugin that compresses coding agent sessions with Claude and injects them back.",
    links: { home: CM_GH, docs: "https://docs.claude-mem.ai/", github: CM_GH },
    rows: {
      what: {
        value: "Memory plugin that captures coding agent sessions, compresses them with AI and injects relevant context into future sessions.",
        src: CM_GH,
      },
      license: { value: "Apache-2.0", src: CM_GH },
      deployment: { value: "Runs locally next to your agent, with a background worker and a web viewer.", src: CM_GH },
      storage: { value: "SQLite with FTS5 and a Chroma vector database. Compression goes through the Claude Agent SDK, so it needs Claude access.", src: CM_GH },
      capture: { value: "Automatic, through 5 lifecycle hooks: SessionStart, UserPromptSubmit, PostToolUse, Stop and SessionEnd.", src: CM_GH },
      integrations: {
        value: "Built for Claude Code. The README also lists OpenClaw, Codex, Gemini, Hermes, Copilot and OpenCode, and it exposes MCP search tools.",
        src: CM_GH,
      },
      retrieval: { value: "Hybrid semantic and keyword search (Chroma plus SQLite FTS5) through a search, timeline and get_observations flow.", src: CM_GH },
      benchmarks: { value: "not documented", src: CM_GH },
      pricing: { value: "Free and open source. Compression uses your Claude usage.", src: CM_GH },
    },
    summary:
      "claude-mem and agentmemory solve the same problem the same way: hooks capture coding sessions and context comes back next time. They differ in what runs the compression, what storage they need, and how much of memory they model.",
    differ: [
      "claude-mem compresses observations with Claude through the Claude Agent SDK, so every compression is a model call. agentmemory stores observations as captured and works with no model at all; an LLM is optional and only used for consolidation if you add one.",
      "claude-mem uses SQLite plus a Chroma vector database. agentmemory runs as one process with its own storage and local embeddings, and adds a knowledge graph and four memory tiers with decay.",
      "Both capture through hooks. agentmemory also ships native plugins for Codex CLI, Cursor, Copilot CLI and others, 54 MCP tools, a REST API, and a release gate that checks crash recovery on every publish.",
    ],
    chooseThem: [
      "You live in Claude Code and want AI-written summaries of every session.",
      "You are fine spending Claude usage on compression.",
      "You prefer its search, timeline and observation flow.",
    ],
    chooseUs: [
      "You want memory that works with no model calls and no API key.",
      "You use several agents and want one shared memory across them.",
      "You want tiered memory with decay, a knowledge graph and crash-safe capture.",
    ],
    moving: [
      "Install agentmemory with npx -y @agentmemory/agentmemory@latest and connect Claude Code during setup.",
      "Bring in past sessions from your Claude Code transcripts with npx -y @agentmemory/agentmemory@latest import-jsonl. Claude Code keeps transcripts for 30 days by default.",
      "Disable the claude-mem plugin so only one tool captures each session.",
    ],
  },
  {
    slug: "letta",
    name: "Letta",
    tagline: "A platform for stateful agents, where the agent edits its own memory.",
    links: { home: "https://www.letta.com", docs: LETTA_DOCS, github: "https://github.com/letta-ai/letta" },
    rows: {
      what: {
        value: "Platform for building stateful agents. An agent runtime with memory, rather than memory for an agent you already use.",
        src: LETTA_DOCS,
      },
      license: { value: "Apache-2.0", src: "https://github.com/letta-ai/letta" },
      deployment: { value: "Letta Cloud, or the Letta server run yourself.", src: LETTA_DOCS },
      storage: { value: "Handled by Letta Cloud or the self-hosted Letta server.", src: LETTA_DOCS },
      capture: {
        value: "Agent-managed. The agent reads and updates its own memory blocks with built-in memory tools.",
        src: "https://docs.letta.com/v1-sdk/memory/memory-blocks",
      },
      integrations: {
        value: "Python and TypeScript SDKs. Letta Code is its open source coding agent harness.",
        src: "https://docs.letta.com/v1-sdk/memory/memory-blocks",
      },
      retrieval: {
        value: "Core memory blocks are injected into the context window, and the agent changes them through tools.",
        src: "https://docs.letta.com/v1-sdk/concepts/stateful-agents",
      },
      benchmarks: { value: "not documented", src: LETTA_DOCS },
      pricing: { value: "not documented", src: LETTA_DOCS },
    },
    summary:
      "Letta is a runtime you build agents in, and its agents manage their own memory. agentmemory adds memory to agents you already use, without changing how they run.",
    differ: [
      "With Letta you create agents on its platform, and each agent edits its memory blocks through tools. With agentmemory you keep your current coding agent, and memory is captured around it by hooks.",
      "Letta memory belongs to Letta agents. agentmemory memory is shared by every connected agent, so Claude Code, Cursor and Codex all read from one store.",
      "Letta runs as Letta Cloud or a Letta server. agentmemory runs as one local process with nothing else to deploy.",
    ],
    chooseThem: [
      "You are building your own long-running agents and want a full runtime.",
      "You want agents that decide for themselves what to remember.",
      "You want shared memory blocks across agents you design.",
    ],
    chooseUs: [
      "You want memory for the coding agents you already use.",
      "You want capture to be automatic instead of agent-decided.",
      "You want a single local process with no platform to run.",
    ],
  },
  {
    slug: "cognee",
    name: "Cognee",
    tagline: "An open source memory platform that turns your data into a knowledge graph.",
    links: { home: "https://www.cognee.ai", docs: "https://docs.cognee.ai/", github: COGNEE_GH },
    rows: {
      what: { value: "Open source AI memory platform for agents that builds a knowledge graph from the data you give it.", src: COGNEE_GH },
      license: { value: "Apache-2.0", src: COGNEE_GH },
      deployment: { value: "Python library, Docker image, or Cognee Cloud.", src: COGNEE_GH },
      storage: { value: "Graph, vector and relational stores. It can run the whole memory layer on a single Postgres instance.", src: COGNEE_GH },
      capture: {
        value: "Explicit. Your code calls cognee.remember (or add), and a pipeline turns the data into a graph. An LLM is optional with a local extraction model.",
        src: COGNEE_GH,
      },
      integrations: { value: "MCP server, a Claude Code memory plugin, Cursor and Cline, plus Python, TypeScript and Rust clients and REST.", src: COGNEE_GH },
      retrieval: { value: "cognee.recall routes between graph, vector and code retrieval, or combines them.", src: COGNEE_GH },
      benchmarks: {
        value: "Their published scores: 0.79 at 100K tokens and 0.67 at 10M tokens of context on their own evaluation.",
        src: COGNEE_GH,
      },
      pricing: { value: "The library is free. Cognee Cloud pricing: not documented.", src: COGNEE_GH },
    },
    summary:
      "Cognee builds knowledge graphs from data you feed it, for agents and apps. agentmemory captures coding agent sessions automatically and keeps them on your machine.",
    differ: [
      "Cognee is a pipeline you run over documents and data: add them, then turn them into a graph. agentmemory captures what your coding agent does as it works, through hooks.",
      "Cognee relies on graph, vector and relational stores, which can share one Postgres. agentmemory needs no database at all and runs as one process.",
      "Both offer MCP and a Claude Code integration. agentmemory adds native plugins for many coding agents, a live viewer, and four memory tiers with decay.",
    ],
    chooseThem: [
      "You want to build a knowledge graph from documents, code and data sources.",
      "You need Python, TypeScript and Rust clients in your own app.",
      "You already run Postgres and want memory inside it.",
    ],
    chooseUs: [
      "You want your coding sessions remembered without feeding data in by hand.",
      "You want no database to run.",
      "You want one memory shared across many coding agents.",
    ],
  },
];

export function getCompetitor(slug: string) {
  return COMPETITORS.find((c) => c.slug === slug);
}
