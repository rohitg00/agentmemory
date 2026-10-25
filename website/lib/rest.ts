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
  OpenUK: { src: "/featured/openuk-logo.png", wide: true },
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
];
