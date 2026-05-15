import Image from "next/image";
import styles from "./Agents.module.css";

interface Agent {
  id: string;
  name: string;
  from: string;
  logo: string;
  accent: string;
  href: string;
  featured?: boolean;
  pitch?: string;
  sub?: string;
}

const FEATURED: Agent[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    from: "Anthropic",
    logo: "https://github.com/anthropics.png",
    accent: "#CC785C",
    href: "https://claude.com/product/claude-code",
    pitch: "12 hooks + MCP + skills",
    sub: "FIRST-CLASS PLUGIN",
  },
  {
    id: "codex",
    name: "Codex CLI",
    from: "OpenAI",
    logo: "https://github.com/openai.png",
    accent: "#10A37F",
    href: "https://github.com/openai/codex",
    pitch: "6 hooks + MCP · native plugin",
    sub: "NATIVE PLUGIN",
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    from: "openclaw",
    logo: "https://github.com/openclaw.png",
    accent: "#FFA000",
    href: "https://github.com/openclaw/openclaw",
    pitch: "onSessionStart · onPreLlmCall · onPostToolUse · onSessionEnd",
    sub: "GATEWAY PLUGIN",
  },
  {
    id: "hermes",
    name: "Hermes",
    from: "Nous Research",
    logo: "https://github.com/NousResearch.png",
    accent: "#7A5BFF",
    href: "https://github.com/NousResearch",
    pitch: "Python plugin · yaml config",
    sub: "FIRST-PARTY INTEGRATION",
  },
  {
    id: "pi",
    name: "pi",
    from: "pi",
    logo: "https://raw.githubusercontent.com/rohitg00/agentmemory/main/assets/agents/pi.svg",
    accent: "#FF6B35",
    href: "https://github.com/rohitg00/agentmemory/tree/main/integrations/pi",
    pitch: "Native plugin + MCP",
    sub: "NATIVE PLUGIN",
  },
  {
    id: "openhuman",
    name: "OpenHuman",
    from: "tinyhumansai",
    logo: "https://raw.githubusercontent.com/tinyhumansai/openhuman/main/app/src-tauri/icons/128x128.png",
    accent: "#9b5cf6",
    href: "https://github.com/tinyhumansai/openhuman",
    pitch: "Native Memory trait backend (Rust)",
    sub: "NATIVE BACKEND",
  },
];

const MARQUEE: Agent[] = [
  {
    id: "claude-desktop",
    name: "Claude Desktop",
    from: "Anthropic",
    logo: "https://github.com/anthropics.png",
    accent: "#CC785C",
    href: "https://claude.ai/download",
  },
  {
    id: "cursor",
    name: "Cursor",
    from: "Anysphere",
    logo: "https://www.freelogovectors.net/wp-content/uploads/2025/06/cursor-logo-freelogovectors.net_.png",
    accent: "#000000",
    href: "https://cursor.com",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    from: "Google",
    logo: "https://github.com/google-gemini.png",
    accent: "#4285F4",
    href: "https://github.com/google-gemini/gemini-cli",
  },
  {
    id: "opencode",
    name: "OpenCode",
    from: "opencode-ai",
    logo: "https://github.com/opencode-ai.png",
    accent: "#22C55E",
    href: "https://github.com/opencode-ai/opencode",
  },
  {
    id: "cline",
    name: "Cline",
    from: "cline",
    logo: "https://github.com/cline.png",
    accent: "#F59E0B",
    href: "https://github.com/cline/cline",
  },
  {
    id: "roo",
    name: "Roo Code",
    from: "RooCode",
    logo: "https://github.com/RooCodeInc.png",
    accent: "#EC4899",
    href: "https://github.com/RooCodeInc/Roo-Code",
  },
  {
    id: "kilo",
    name: "Kilo Code",
    from: "Kilo-Org",
    logo: "https://github.com/Kilo-Org.png",
    accent: "#06B6D4",
    href: "https://github.com/Kilo-Org/kilocode",
  },
  {
    id: "goose",
    name: "Goose",
    from: "Block",
    logo: "https://github.com/block.png",
    accent: "#00D54B",
    href: "https://github.com/block/goose",
  },
  {
    id: "aider",
    name: "Aider",
    from: "Aider-AI",
    logo: "https://github.com/Aider-AI.png",
    accent: "#E11D48",
    href: "https://github.com/Aider-AI/aider",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    from: "Codeium",
    logo: "https://exafunction.github.io/public/brand/windsurf-black-symbol.svg",
    accent: "#00A699",
    href: "https://windsurf.com",
  },
];

function FeaturedCard({ a }: { a: Agent }) {
  return (
    <a
      className={styles.featured}
      href={a.href}
      target="_blank"
      rel="noopener"
      style={{ ["--agent-accent" as string]: a.accent }}
    >
      <div className={styles.featuredHead}>
        <div className={styles.featuredLogo}>
          <Image
            src={a.logo}
            width={56}
            height={56}
            alt={`${a.name} logo`}
            unoptimized
          />
        </div>
        <div className={styles.featuredMeta}>
          <span className={styles.featuredSub}>{a.sub}</span>
          <span className={styles.featuredName}>{a.name}</span>
          <span className={styles.featuredFrom}>FROM {a.from}</span>
        </div>
      </div>
      <p className={styles.featuredPitch}>{a.pitch}</p>
      <span className={styles.featuredArrow} aria-hidden>
        ↗
      </span>
    </a>
  );
}

function MarqueeTile({ a }: { a: Agent }) {
  return (
    <a
      className={styles.tile}
      href={a.href}
      target="_blank"
      rel="noopener"
      style={{ ["--agent-accent" as string]: a.accent }}
    >
      <Image
        src={a.logo}
        width={48}
        height={48}
        alt={`${a.name} logo`}
        unoptimized
        className={styles.tileLogo}
      />
      <div className={styles.tileMeta}>
        <span className={styles.tileName}>{a.name}</span>
        <span className={styles.tileFrom}>FROM {a.from}</span>
      </div>
    </a>
  );
}

export function Agents() {
  const loop = [...MARQUEE, ...MARQUEE];
  return (
    <section className={styles.wrap} id="agents" aria-labelledby="agents-title">
      <header className="section-head">
        <span className="section-eyebrow">WORKS WITH</span>
        <h2 id="agents-title" className="section-title">
          SIX FIRST-PARTY.<br />REST MCP-NATIVE.
        </h2>
        <p className="section-lede">
          NATIVE PLUGINS FOR CLAUDE CODE, CODEX CLI, OPENCLAW, HERMES, PI, AND
          OPENHUMAN. EVERY OTHER MCP CLIENT GETS IT FOR FREE. `agentmemory
          connect &lt;agent&gt;` AUTO-WIRES THEM ALL.
        </p>
      </header>

      <div className={styles.featuredRow}>
        {FEATURED.map((a) => (
          <FeaturedCard key={a.id} a={a} />
        ))}
      </div>

      <div className={styles.marqueeWrap} aria-label="Other compatible agents">
        <div className={styles.fadeLeft} aria-hidden />
        <div className={styles.fadeRight} aria-hidden />
        <div className={styles.marquee}>
          {loop.map((a, i) => (
            <MarqueeTile key={`${a.id}-${i}`} a={a} />
          ))}
        </div>
      </div>
    </section>
  );
}
