export const MCP_JSON = `{
  "mcpServers": {
    "agentmemory": {
      "command": "npx",
      "args": ["-y", "@agentmemory/mcp"],
      "env": {
        "AGENTMEMORY_URL": "\${AGENTMEMORY_URL}",
        "AGENTMEMORY_SECRET": "\${AGENTMEMORY_SECRET}"
      }
    }
  }
}`;

export const LOGO_OVERRIDES: Record<string, string> = {
  "Copilot CLI": "https://svgl.app/library/github_light.svg",
  Cursor: "https://svgl.app/library/cursor_light.svg",
  Zed: "https://svgl.app/library/zed-logo.svg",
  "Qwen Code": "https://svgl.app/library/qwen_light.svg",
  OpenHuman: "https://github.com/tinyhumansai.png",
};

export const FEATURED_LOGOS: Record<string, { src: string; wide?: boolean }> = {
  AlphaSignal: { src: "https://avatars.githubusercontent.com/u/64016073?s=96&v=4" },
  "Agentic AI Foundation": { src: "/featured/aaif-logo.png", wide: true },
  Trendshift: { src: "https://trendshift.io/favicon.ico" },
  "Product Hunt": { src: "https://cdn.simpleicons.org/producthunt" },
};

export const INTERFACES = [
  {
    id: "viewer",
    label: "Viewer",
    port: ":3113",
    title: "The viewer ships with the server",
    body: "agentmemory starts a real-time viewer on port 3113 with no extra install. Watch observations arrive as hooks fire, replay any past session, browse memories and the knowledge graph, and check health on one page.",
    points: ["Live observation stream", "Session replay", "Memory and graph browser", "Health and status page"],
    img: "/demo.gif",
    width: 720,
    height: 405,
    alt: "agentmemory viewer showing a live stream of captured observations",
    launch: "open http://localhost:3113",
  },
  {
    id: "console",
    label: "Engine console",
    port: ":3114",
    title: "Every function, worker and queue",
    body: "agentmemory runs on the iii engine, and its console shows what the engine is doing: registered functions you can invoke with JSON, HTTP endpoints you can replay, and live stream frames.",
    points: ["Invoke any function directly", "Replay REST calls", "Watch WebSocket frames", "Bound to 127.0.0.1"],
    img: "/dashboard.png",
    width: 2972,
    height: 1688,
    alt: "iii console dashboard for the agentmemory engine",
    launch: "agentmemory console",
  },
  {
    id: "state",
    label: "State",
    port: ":3114/states",
    title: "Browse the raw store",
    body: "Every key agentmemory writes is visible and editable in the state browser, so you can see exactly what is stored about your sessions.",
    points: ["Raw KV browser", "JSON editor", "Scopes such as mem:obs and mem:memories"],
    img: "/states.png",
    width: 2503,
    height: 1344,
    alt: "iii console state browser listing agentmemory keys",
    launch: "open http://localhost:3114/states",
  },
  {
    id: "traces",
    label: "Traces",
    port: ":3114/traces",
    title: "OpenTelemetry out of the box",
    body: "Every memory operation emits a trace span and a structured log. Traces stay in memory on your machine by default, and you can point the exporter at any OTLP backend.",
    points: ["Waterfall and flame views", "Span per memory operation", "Local by default"],
    img: "/traces-waterfall.png",
    width: 2984,
    height: 1708,
    alt: "trace waterfall for an agentmemory recall",
    launch: "open http://localhost:3114/traces",
  },
];
