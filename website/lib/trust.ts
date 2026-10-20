export const MACHINE_NODES = [
  { name: "coding agent", sub: "Claude Code, Codex, Cursor and others" },
  { name: "hooks + MCP", sub: "PostToolUse, SessionStart, 54 tools" },
  { name: "agentmemory", sub: "127.0.0.1:3111, REST and MCP, auth on" },
  { name: "iii engine", sub: "streams :3112, workers :49134" },
  { name: "on disk", sub: "~/.agentmemory and the data dir" },
];

export const DISK_WRITES = [
  { id: "obs_01", what: "PostToolUse · Read src/auth/session.ts" },
  { id: "obs_02", what: "PostToolUse · Bash npm test -- auth" },
  { id: "obs_03", what: "PostToolUse · Edit src/auth/refresh.ts" },
];

export const MACHINE_EXTRAS = [
  { name: "viewer", sub: "127.0.0.1:3113" },
  { name: "secret", sub: "~/.agentmemory/secret, mode 0600" },
];

export const PROVIDERS = [
  {
    name: "LLM provider",
    sends: "Observation text it needs to write summaries and consolidate memories, once you add a key.",
  },
  {
    name: "Embedding provider",
    sends: "Text to embed for semantic recall. EMBEDDING_PROVIDER=local embeds on your machine and sends nothing.",
  },
];

export const TELEMETRY_LINE =
  "Telemetry: none. The iii engine's anonymous usage telemetry is off; agentmemory starts it with III_TELEMETRY_ENABLED=false.";

export const GATE_NOTES: Record<string, string> = {
  install: "npm pack, then install the tarball into an empty prefix and record its sha256",
  dedup: "SIGKILL the engine and CLI, restart, replay the event twice: stored once",
  vectors: "SIGKILL before the first checkpoint, restart: 0 inputs re-embedded",
  offline: "stop the server, run hooks into capture-spool, restart: spool drained to 0",
  deadletter: "SIGKILL, restart: the failed capture is still a dead letter, then retries through POST /capture/retry",
};

export const GATE_SOURCE = "https://github.com/rohitg00/agentmemory/blob/main/scripts/release-gate/run.mjs";
export const GATE_WORKFLOW = "https://github.com/rohitg00/agentmemory/blob/main/.github/workflows/release-gate.yml";
