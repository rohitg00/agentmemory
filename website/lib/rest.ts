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

export const VIEWER = {
  features: ["Memories", "Session replay", "Lessons", "Knowledge graph", "Health"],
  img: "/demo.gif",
  width: 1080,
  height: 610,
  alt: "Recorded tour of the AgentMemory viewer with sample project data",
};
