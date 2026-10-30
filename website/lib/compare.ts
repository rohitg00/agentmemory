import { AGENTS, REPO_URL, src } from "@/lib/site";
import { EVALUATION, percent } from "@/lib/bench";

export const CHECKED_ON = "2026-10-28";

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
  what: { value: "Shared memory for existing coding agents.", src: README },
  license: { value: "Apache-2.0", src: `${REPO_URL}/blob/main/LICENSE` },
  deployment: { value: "Local service; REST and viewer bind to loopback by default.", src: README },
  storage: { value: "CLI-installed runtime with file-backed state; no separate database service required by default.", src: README },
  capture: { value: "Automatic capture on supported integrations; explicit MCP and REST writes.", src: README },
  integrations: { value: `${AGENTS.length} listed agents through native plugins, MCP or REST. Capabilities vary by host.`, src: `${REPO_URL}#works-with-every-agent` },
  retrieval: { value: "Keyless BM25; optional vectors and graph. Scoped recall, context budgets and source expansion.", src: src.recall },
  benchmarks: { value: `BM25 component strict recall-all@5: ${percent(EVALUATION.longmemeval.byAdapter["agentmemory-bm25-component"].recallAll)} on 470 answerable LongMemEval-S questions. No reader or daemon.`, src: src.longmemeval },
  pricing: { value: "No license fee. You operate the runtime; optional hosted providers bill their usage.", src: README },
};

export const COMPETITORS: Competitor[] = [
  {
    "slug": "mem0",
    "name": "Mem0",
    "tagline": "Memory APIs and agent plugins, with hosted and open-source options.",
    "links": {
      "home": "https://mem0.ai",
      "docs": "https://docs.mem0.ai/introduction",
      "github": "https://github.com/mem0ai/mem0"
    },
    "rows": {
      "what": {
        "value": "Memory for apps and coding agents",
        "src": "https://docs.mem0.ai/introduction"
      },
      "license": {
        "value": "Apache-2.0 library; commercial platform",
        "src": "https://docs.mem0.ai/introduction"
      },
      "deployment": {
        "value": "Hosted, self-hosted, or in-process",
        "src": "https://docs.mem0.ai/introduction"
      },
      "storage": {
        "value": "Configured models and stores; managed on Platform",
        "src": "https://docs.mem0.ai/introduction"
      },
      "capture": {
        "value": "API calls or agent integrations",
        "src": "https://docs.mem0.ai/introduction"
      },
      "integrations": {
        "value": "SDKs, MCP, coding-agent plugins",
        "src": "https://docs.mem0.ai/introduction"
      },
      "retrieval": {
        "value": "Memory search; graph availability differs between OSS and Platform",
        "src": "https://docs.mem0.ai/introduction"
      },
      "benchmarks": {
        "value": "No matched head-to-head run in this evaluation.",
        "src": "https://github.com/rohitg00/agentmemory/blob/main/docs/benchmarks/2026-10-28-retrieval-evaluation.md"
      },
      "pricing": {
        "value": "See current plans and provider costs.",
        "src": "https://mem0.ai/pricing"
      }
    },
    "summary": "Memory APIs and agent plugins, with hosted and open-source options. AgentMemory provides local memory shared by existing coding agents.",
    "differ": [
      "Mem0 provides application-facing APIs and agent plugins. Check the Platform-versus-OSS feature matrix for the deployment you choose."
    ],
    "chooseThem": [
      "You want a memory API inside an application or a managed platform."
    ],
    "chooseUs": [
      "You want shared coding history with scoped recall, source expansion and a local viewer.",
      "You want keyword retrieval without an API key."
    ]
  },
  {
    "slug": "supermemory",
    "name": "Supermemory",
    "tagline": "Memory and document context through hosted or local deployment.",
    "links": {
      "home": "https://supermemory.ai",
      "docs": "https://supermemory.ai/docs/self-hosting/overview",
      "github": "https://github.com/supermemoryai/supermemory"
    },
    "rows": {
      "what": {
        "value": "Memory and document context",
        "src": "https://supermemory.ai/docs/self-hosting/overview"
      },
      "license": {
        "value": "Local server code is non-public; SDKs are public",
        "src": "https://supermemory.ai/docs/self-hosting/overview"
      },
      "deployment": {
        "value": "Hosted API or local server binary",
        "src": "https://supermemory.ai/docs/self-hosting/overview"
      },
      "storage": {
        "value": "Embedded storage and local embeddings in the local server",
        "src": "https://supermemory.ai/docs/self-hosting/overview"
      },
      "capture": {
        "value": "API, MCP or coding-agent plugins",
        "src": "https://supermemory.ai/docs/self-hosting/overview"
      },
      "integrations": {
        "value": "SDKs and agent integrations",
        "src": "https://supermemory.ai/docs/self-hosting/overview"
      },
      "retrieval": {
        "value": "Memory and document retrieval",
        "src": "https://supermemory.ai/docs/self-hosting/overview"
      },
      "benchmarks": {
        "value": "No matched head-to-head run in this evaluation.",
        "src": "https://github.com/rohitg00/agentmemory/blob/main/docs/benchmarks/2026-10-28-retrieval-evaluation.md"
      },
      "pricing": {
        "value": "See current plans and provider costs.",
        "src": "https://supermemory.ai/pricing"
      }
    },
    "summary": "Memory and document context through hosted or local deployment. AgentMemory provides local memory shared by existing coding agents.",
    "differ": [
      "Supermemory supports local deployment. Its local server and hosted API have different feature sets and licensing; the local server is a separate non-public codebase."
    ],
    "chooseThem": [
      "You want application context APIs or its document integrations."
    ],
    "chooseUs": [
      "You want shared coding history with scoped recall, source expansion and a local viewer.",
      "You want keyword retrieval without an API key."
    ]
  },
  {
    "slug": "zep",
    "name": "Zep",
    "tagline": "Enterprise context, alongside the open-source Graphiti framework.",
    "links": {
      "home": "https://www.getzep.com",
      "docs": "https://github.com/getzep/graphiti",
      "github": "https://github.com/getzep/graphiti"
    },
    "rows": {
      "what": {
        "value": "Enterprise context; Graphiti temporal graphs",
        "src": "https://github.com/getzep/graphiti"
      },
      "license": {
        "value": "Commercial Zep; Apache-2.0 Graphiti",
        "src": "https://github.com/getzep/graphiti"
      },
      "deployment": {
        "value": "Managed or BYOC Zep; self-hosted Graphiti",
        "src": "https://github.com/getzep/graphiti"
      },
      "storage": {
        "value": "Zep manages its stack; Graphiti needs configured database/models",
        "src": "https://github.com/getzep/graphiti"
      },
      "capture": {
        "value": "Application ingestion",
        "src": "https://github.com/getzep/graphiti"
      },
      "integrations": {
        "value": "SDKs and MCP",
        "src": "https://github.com/getzep/graphiti"
      },
      "retrieval": {
        "value": "Temporal graph and hybrid retrieval",
        "src": "https://github.com/getzep/graphiti"
      },
      "benchmarks": {
        "value": "No matched head-to-head run in this evaluation.",
        "src": "https://github.com/rohitg00/agentmemory/blob/main/docs/benchmarks/2026-10-28-retrieval-evaluation.md"
      },
      "pricing": {
        "value": "See current plans and provider costs.",
        "src": "https://www.getzep.com/pricing/"
      }
    },
    "summary": "Enterprise context, alongside the open-source Graphiti framework. AgentMemory provides local memory shared by existing coding agents.",
    "differ": [
      "Zep and Graphiti are distinct deployment choices. Evaluate Zep for enterprise context and Graphiti for a graph framework you operate."
    ],
    "chooseThem": [
      "You need shared business context or temporal graph infrastructure."
    ],
    "chooseUs": [
      "You want shared coding history with scoped recall, source expansion and a local viewer.",
      "You want keyword retrieval without an API key."
    ]
  },
  {
    "slug": "claude-mem",
    "name": "claude-mem",
    "tagline": "Coding-session capture with model-backed summaries.",
    "links": {
      "home": "https://github.com/thedotmack/claude-mem",
      "docs": "https://github.com/thedotmack/claude-mem",
      "github": "https://github.com/thedotmack/claude-mem"
    },
    "rows": {
      "what": {
        "value": "Coding-session memory",
        "src": "https://github.com/thedotmack/claude-mem"
      },
      "license": {
        "value": "Apache-2.0 project",
        "src": "https://github.com/thedotmack/claude-mem"
      },
      "deployment": {
        "value": "Local worker; hosted observer option",
        "src": "https://github.com/thedotmack/claude-mem"
      },
      "storage": {
        "value": "Worker storage and a selected summary provider",
        "src": "https://github.com/thedotmack/claude-mem"
      },
      "capture": {
        "value": "Native integrations and hooks",
        "src": "https://github.com/thedotmack/claude-mem"
      },
      "integrations": {
        "value": "Multiple coding agents, including Pi and OMP",
        "src": "https://github.com/thedotmack/claude-mem"
      },
      "retrieval": {
        "value": "Search, timeline and source observations",
        "src": "https://github.com/thedotmack/claude-mem"
      },
      "benchmarks": {
        "value": "No matched head-to-head run in this evaluation.",
        "src": "https://github.com/rohitg00/agentmemory/blob/main/docs/benchmarks/2026-10-28-retrieval-evaluation.md"
      },
      "pricing": {
        "value": "See current plans and provider costs.",
        "src": "https://github.com/thedotmack/claude-mem"
      }
    },
    "summary": "Coding-session capture with model-backed summaries. AgentMemory provides local memory shared by existing coding agents.",
    "differ": [
      "claude-mem offers several summary providers, including a hosted observer. AgentMemory also offers optional LLM processing, while its keyless mode stores and searches captures without a model."
    ],
    "chooseThem": [
      "You prefer its observer and session-summary workflow."
    ],
    "chooseUs": [
      "You want shared coding history with scoped recall, source expansion and a local viewer.",
      "You want keyword retrieval without an API key."
    ]
  },
  {
    "slug": "letta",
    "name": "Letta",
    "tagline": "A stateful-agent runtime with persistent memory.",
    "links": {
      "home": "https://www.letta.com",
      "docs": "https://docs.letta.com/",
      "github": "https://github.com/letta-ai/letta-code"
    },
    "rows": {
      "what": {
        "value": "Stateful-agent platform and harness",
        "src": "https://docs.letta.com/"
      },
      "license": {
        "value": "Open-source harness; commercial cloud options",
        "src": "https://docs.letta.com/"
      },
      "deployment": {
        "value": "Managed cloud or self-hosted runtime",
        "src": "https://docs.letta.com/"
      },
      "storage": {
        "value": "Agent runtime and configured models",
        "src": "https://docs.letta.com/"
      },
      "capture": {
        "value": "Agent-managed memory",
        "src": "https://docs.letta.com/"
      },
      "integrations": {
        "value": "CLI, Agent SDK, ACP and MCP",
        "src": "https://docs.letta.com/"
      },
      "retrieval": {
        "value": "MemFS and shared memory",
        "src": "https://docs.letta.com/"
      },
      "benchmarks": {
        "value": "No matched head-to-head run in this evaluation.",
        "src": "https://github.com/rohitg00/agentmemory/blob/main/docs/benchmarks/2026-10-28-retrieval-evaluation.md"
      },
      "pricing": {
        "value": "See current plans and provider costs.",
        "src": "https://docs.letta.com/"
      }
    },
    "summary": "A stateful-agent runtime with persistent memory. AgentMemory provides local memory shared by existing coding agents.",
    "differ": [
      "Letta supplies the agent runtime and its memory system. AgentMemory supplies a shared memory service for tools you already use."
    ],
    "chooseThem": [
      "You want to build or run stateful agents in an integrated harness."
    ],
    "chooseUs": [
      "You want shared coding history with scoped recall, source expansion and a local viewer.",
      "You want keyword retrieval without an API key."
    ]
  },
  {
    "slug": "cognee",
    "name": "Cognee",
    "tagline": "Knowledge graphs from documents, code and conversations.",
    "links": {
      "home": "https://www.cognee.ai",
      "docs": "https://github.com/topoteretes/cognee",
      "github": "https://github.com/topoteretes/cognee"
    },
    "rows": {
      "what": {
        "value": "Memory platform and knowledge pipeline",
        "src": "https://github.com/topoteretes/cognee"
      },
      "license": {
        "value": "Open-source project; commercial offerings",
        "src": "https://github.com/topoteretes/cognee"
      },
      "deployment": {
        "value": "Local library/server or Cognee Cloud",
        "src": "https://github.com/topoteretes/cognee"
      },
      "storage": {
        "value": "Configured storage; local extraction/embedding models available",
        "src": "https://github.com/topoteretes/cognee"
      },
      "capture": {
        "value": "API, CLI, plugins and MCP",
        "src": "https://github.com/topoteretes/cognee"
      },
      "integrations": {
        "value": "Python, TypeScript, Rust and coding-agent integrations",
        "src": "https://github.com/topoteretes/cognee"
      },
      "retrieval": {
        "value": "Graph, vector and code retrieval",
        "src": "https://github.com/topoteretes/cognee"
      },
      "benchmarks": {
        "value": "No matched head-to-head run in this evaluation.",
        "src": "https://github.com/rohitg00/agentmemory/blob/main/docs/benchmarks/2026-10-28-retrieval-evaluation.md"
      },
      "pricing": {
        "value": "See current plans and provider costs.",
        "src": "https://docs.cognee.ai/cognee-cloud/overview"
      }
    },
    "summary": "Knowledge graphs from documents, code and conversations. AgentMemory provides local memory shared by existing coding agents.",
    "differ": [
      "Cognee builds connected knowledge from varied data and supports a keyless local path. AgentMemory focuses on captured coding history, scoped recall and a shared viewer."
    ],
    "chooseThem": [
      "You want a knowledge pipeline across documents, code and conversations."
    ],
    "chooseUs": [
      "You want shared coding history with scoped recall, source expansion and a local viewer.",
      "You want keyword retrieval without an API key."
    ]
  }
];

export function getCompetitor(slug: string) {
  return COMPETITORS.find((c) => c.slug === slug);
}
