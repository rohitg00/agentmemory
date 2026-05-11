"use client";

import { useMemo, useState } from "react";
import styles from "./AgentInstall.module.css";

const UNIVERSAL_JSON = `{
  "mcpServers": {
    "agentmemory": {
      "command": "npx",
      "args": ["-y", "@agentmemory/mcp"],
      "env": {
        "AGENTMEMORY_URL": "http://localhost:3111"
      }
    }
  }
}`;

const CODEX_TOML = `[mcp_servers.agentmemory]
command = "npx"
args    = ["-y", "@agentmemory/mcp"]

[mcp_servers.agentmemory.env]
AGENTMEMORY_URL = "http://localhost:3111"`;

const OPENCODE_JSON = `{
  "mcp": {
    "agentmemory": {
      "type": "local",
      "command": ["npx", "-y", "@agentmemory/mcp"],
      "enabled": true,
      "environment": {
        "AGENTMEMORY_URL": "http://localhost:3111"
      }
    }
  }
}`;

const VSCODE_MCP_JSON = `{
  "servers": {
    "agentmemory": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@agentmemory/mcp"],
      "env": {
        "AGENTMEMORY_URL": "http://localhost:3111"
      }
    }
  }
}`;

const CLAUDE_CODE_CMD = `claude mcp add agentmemory -- npx -y @agentmemory/mcp`;

const HERMES_YAML = `plugins:
  - name: agentmemory
    path: agentmemory/integrations/hermes
    config:
      base_url: http://localhost:3111`;

const OPENCLAW_YAML = `plugins:
  - id: agentmemory
    module: agentmemory/integrations/openclaw/plugin.mjs
    config:
      enabled: true
      base_url: http://localhost:3111`;

function cursorDeeplink(): string {
  const cfg = {
    command: "npx",
    args: ["-y", "@agentmemory/mcp"],
    env: { AGENTMEMORY_URL: "http://localhost:3111" },
  };
  const base64 =
    typeof window !== "undefined"
      ? btoa(JSON.stringify(cfg))
      : Buffer.from(JSON.stringify(cfg)).toString("base64");
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=agentmemory&config=${encodeURIComponent(base64)}`;
}

function vscodeDeeplink(): string {
  const cfg = {
    name: "agentmemory",
    command: "npx",
    args: ["-y", "@agentmemory/mcp"],
    env: { AGENTMEMORY_URL: "http://localhost:3111" },
  };
  const payload =
    typeof window !== "undefined"
      ? encodeURIComponent(JSON.stringify(cfg))
      : encodeURIComponent(JSON.stringify(cfg));
  return `vscode:mcp/install?${payload}`;
}

type ChipKind = "deeplink" | "copy";
interface Chip {
  id: string;
  label: string;
  kind: ChipKind;
  href?: string;
  copyText?: string;
  sub: string;
}

function CopyButton({
  text,
  label = "COPY",
  small,
}: {
  text: string;
  label?: string;
  small?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };
  return (
    <button
      className={`${styles.copyBtn} ${small ? styles.copyBtnSmall : ""} ${
        copied ? styles.copyBtnOk : ""
      }`}
      onClick={onClick}
    >
      {copied ? "COPIED ✓" : label}
    </button>
  );
}

function Chip({ chip }: { chip: Chip }) {
  const [copied, setCopied] = useState(false);
  const inner = (
    <>
      <span className={styles.chipLabel}>{chip.label}</span>
      <span className={styles.chipSub}>
        {chip.kind === "deeplink" ? "OPEN" : copied ? "COPIED ✓" : chip.sub}
      </span>
    </>
  );

  if (chip.kind === "deeplink" && chip.href) {
    return (
      <a className={styles.chip} href={chip.href}>
        {inner}
      </a>
    );
  }

  const onClick = async () => {
    if (!chip.copyText) return;
    try {
      await navigator.clipboard.writeText(chip.copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };
  return (
    <button
      className={`${styles.chip} ${copied ? styles.chipOk : ""}`}
      onClick={onClick}
    >
      {inner}
    </button>
  );
}

function Snippet({
  title,
  body,
  hint,
}: {
  title: string;
  body: string;
  hint: string;
}) {
  return (
    <div className={styles.snippet}>
      <div className={styles.snippetHead}>
        <span className={styles.snippetTitle}>{title}</span>
        <span className={styles.snippetHint}>{hint}</span>
      </div>
      <pre className={styles.code}>
        <code>{body}</code>
      </pre>
      <div className={styles.copyRow}>
        <CopyButton text={body} />
      </div>
    </div>
  );
}

export function AgentInstall() {
  const cursor = useMemo(cursorDeeplink, []);
  const vscode = useMemo(vscodeDeeplink, []);
  const [showMore, setShowMore] = useState(false);

  const chips: Chip[] = [
    {
      id: "cursor",
      label: "CURSOR",
      kind: "deeplink",
      href: cursor,
      sub: "DEEPLINK",
    },
    {
      id: "vscode",
      label: "VS CODE",
      kind: "deeplink",
      href: vscode,
      sub: "DEEPLINK",
    },
    {
      id: "claude-code",
      label: "CLAUDE CODE",
      kind: "copy",
      copyText: CLAUDE_CODE_CMD,
      sub: "COPY CMD",
    },
    {
      id: "claude-desktop",
      label: "CLAUDE DESKTOP",
      kind: "copy",
      copyText: UNIVERSAL_JSON,
      sub: "COPY JSON",
    },
    {
      id: "gemini",
      label: "GEMINI CLI",
      kind: "copy",
      copyText: UNIVERSAL_JSON,
      sub: "COPY JSON",
    },
    {
      id: "codex",
      label: "CODEX CLI",
      kind: "copy",
      copyText: CODEX_TOML,
      sub: "COPY TOML",
    },
  ];

  return (
    <div className={styles.wrap}>
      <div className={styles.stepLabel}>3. WIRE UP ANY AGENT</div>
      <p className={styles.helper}>
        ONE MCP JSON FITS ALMOST EVERYTHING. PICK YOUR AGENT ON THE LEFT, OR
        PASTE THE UNIVERSAL CONFIG ON THE RIGHT.
      </p>

      <div className={styles.split}>
        <div className={styles.chipsCol}>
          <div className={styles.colHead}>AGENTS</div>
          <div className={styles.chips}>
            {chips.map((c) => (
              <Chip key={c.id} chip={c} />
            ))}
          </div>
          <p className={styles.chipNote}>
            CURSOR / VS CODE ARE ONE-CLICK VIA DEEPLINK. OTHERS COPY THE RIGHT
            SNIPPET DIRECTLY TO YOUR CLIPBOARD.
          </p>
        </div>
        <div className={styles.snippetCol}>
          <Snippet
            title="UNIVERSAL MCP JSON"
            hint="WORKS FOR CLAUDE DESKTOP · CURSOR · CLINE · ROO CODE · WINDSURF · GEMINI CLI — MERGE INTO EXISTING mcpServers"
            body={UNIVERSAL_JSON}
          />
        </div>
      </div>

      <button
        className={styles.moreToggle}
        aria-expanded={showMore}
        onClick={() => setShowMore((v) => !v)}
      >
        {showMore ? "— HIDE OTHER SHAPES" : "+ OPENCODE · VS CODE · CODEX · HERMES · OPENCLAW"}
      </button>

      {showMore && (
        <div className={styles.moreGrid}>
          <Snippet
            title="OPENCODE"
            hint="opencode.json — different shape (mcp key, command as array)"
            body={OPENCODE_JSON}
          />
          <Snippet
            title="VS CODE (mcp.json)"
            hint=".vscode/mcp.json — uses servers key, not mcpServers"
            body={VSCODE_MCP_JSON}
          />
          <Snippet
            title="CODEX CLI (TOML)"
            hint="~/.codex/config.toml"
            body={CODEX_TOML}
          />
          <Snippet
            title="HERMES"
            hint="integrations/hermes — plugin.yaml"
            body={HERMES_YAML}
          />
          <Snippet
            title="OPENCLAW"
            hint="integrations/openclaw — plugin.yaml"
            body={OPENCLAW_YAML}
          />
        </div>
      )}
    </div>
  );
}
