import { ICONS } from "./diagram-icons.js";

export interface DiagramFacts {
  restPort: number;
  viewerPort: number;
  restEndpoints: number;
  mcpTools: number;
  resources: number;
  prompts: number;
  hooks: number;
  rrfK: number;
  tokenBudget: number;
  maxPerSession: number;
}

type Layer = { d: LayerDef; ox: number; oy: number; w: number; dd: number; i: number };
type LayerDef = { title: string; lines: string[]; acc?: boolean; base?: boolean; face: () => string };

const fmt = (n: number): string => n.toLocaleString("en-US");
const esc = (s: unknown): string => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const STYLE = `
<style>
  .ink{fill:#1A1918}.muted{fill:#5E5852}.faint{fill:#8A837C}.acc{fill:#E8551F}
  .sans{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
  .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  .line{stroke:#B9B0A7;fill:none}.aline{stroke:#FF6B35;fill:none}
  .card{fill:#FFFFFF;stroke:#CFC6BD}.wash{fill:#F7F3EF;stroke:#DDD5CD}
  .hot{fill:#FFF1EA;stroke:#FFB896}.hotcard{fill:#FFFFFF;stroke:#FF9A6B}
  .zone{fill:#FF6B35;fill-opacity:.04;stroke:#FF6B35;stroke-opacity:.55}
  .chip{fill:#FFFFFF;stroke:#B9B0A7}.pill{fill:#FF6B35}.pilltx{fill:#FFFFFF}
  .top{fill:#FFFFFF;stroke:#BDB4AB}.left{fill:#EEE8E2;stroke:#BDB4AB}.right{fill:#DED6CE;stroke:#BDB4AB}
  .atop{fill:#FFE6DA;stroke:#F07A45}.aleft{fill:#FF8F5E;stroke:#E8551F}.aright{fill:#E8551F;stroke:#C2410C}
  .tile{fill:#FFFFFF;stroke:#C9C0B7}.atile{fill:#FFFFFF;stroke:#F59A6E}
  .t1{fill:#FF6B35}.t2{fill:#FF9466}.t3{fill:#FFBE9E}.t4{fill:#FFE2D3}
  .t1x{fill:#FFFFFF}.t4x{fill:#7A3A1E}
  .guide{stroke:#CFC6BD;stroke-dasharray:3 4;fill:none}
  .dot{fill:#FF6B35}
  .logo{fill:#2A2725}.logos{stroke:#2A2725;fill:none}.glyph{fill:#E8551F}.glyphs{stroke:#E8551F;fill:none}
  @media (prefers-color-scheme:dark){
    .ink{fill:#F3EFEB}.muted{fill:#B3ABA3}.faint{fill:#8C857E}.acc{fill:#FF8F5E}
    .line{stroke:#5A544E}.card{fill:#1F1D1B;stroke:#45403B}.wash{fill:#191716;stroke:#35312D}
    .hot{fill:#2A1B14;stroke:#7A3A1E}.hotcard{fill:#1F1D1B;stroke:#C2410C}
    .zone{fill-opacity:.06}.chip{fill:#1F1D1B;stroke:#5A544E}
    .top{fill:#262321;stroke:#4A443F}.left{fill:#1C1A18;stroke:#4A443F}.right{fill:#141211;stroke:#4A443F}
    .atop{fill:#3A2117;stroke:#C2410C}.aleft{fill:#C2410C;stroke:#9A3412}.aright{fill:#9A3412;stroke:#7C2D12}
    .tile{fill:#1F1D1B;stroke:#4A443F}.atile{fill:#2A1B14;stroke:#C2410C}
    .t2{fill:#D95A26}.t3{fill:#8F3A17}.t4{fill:#4A2214}.t4x{fill:#FFD9C6}
    .guide{stroke:#45403B}
    .logo{fill:#E9E4DF}.logos{stroke:#E9E4DF}.glyph{fill:#FF8F5E}.glyphs{stroke:#FF8F5E}
  }
</style>`;

type TextOpts = { size?: number; cls?: string; weight?: number; anchor?: string; ls?: number };

function txt(x: number, y: number, s: unknown, { size = 12, cls = "ink sans", weight = 400, anchor = "start", ls = 0 }: TextOpts = {}): string {
  return `<text x="${x}" y="${y}" class="${cls}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}"${ls ? ` letter-spacing="${ls}"` : ""}>${esc(s)}</text>`;
}

function icon(name: string, x: number, y: number, size: number, kind: "logo" | "glyph" = "logo"): string {
  const ic = ICONS[name];
  const paths = ic.paths.map((path) => path.stroke
    ? `<path d="${path.d}" class="${kind}s" stroke-width="${path.stroke}" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="${path.d}" class="${kind}"${path.evenodd ? ' fill-rule="evenodd"' : ""}/>`).join("");
  const [, , vw, vh] = ic.vb.split(" ").map(Number);
  const w = size * Math.min(vw / vh, 1.6);
  return `<svg x="${(x - (w - size) / 2).toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${size}" viewBox="${ic.vb}">${paths}</svg>`;
}

const AGENT_LOGOS: Record<string, string> = {
  "Claude Code": "claude",
  Codex: "openai",
  Cursor: "cursor",
  "Copilot CLI": "copilot",
  OpenCode: "opencode",
  "Gemini CLI": "gemini",
  Pi: "pi",
  Hermes: "hermes",
  OpenClaw: "openclaw",
  Orca: "orca",
};

function architecture(f: DiagramFacts): string {
  const W = 960, H = 650;
  const p: string[] = [];
  p.push(txt(W / 2, 26, "YOUR CODING AGENTS", { size: 11, cls: "acc sans", weight: 700, anchor: "middle", ls: 1.6 }));
  const agents = ["Claude Code", "Codex", "Cursor", "Copilot CLI", "OpenCode", "Gemini CLI", "Pi", "Hermes", "OpenClaw", "Orca"];
  const cw = 84, gap = 8, x0 = (W - (agents.length * cw + (agents.length - 1) * gap)) / 2;
  agents.forEach((a, i) => {
    const x = x0 + i * (cw + gap);
    const logo = AGENT_LOGOS[a];
    p.push(`<rect x="${x}" y="36" width="${cw}" height="46" rx="8" class="chip"/>`);
    if (logo) p.push(icon(logo, x + cw / 2 - 8, 43, 16));
    p.push(txt(x + cw / 2, logo ? 73 : 64, a, { size: 11.5, weight: 600, anchor: "middle" }));
    p.push(`<path d="M${x + cw / 2} 82 V94" class="line" stroke-width="1.2"/>`);
  });
  p.push(`<path d="M${x0 + cw / 2} 94 H${x0 + 9 * (cw + gap) + cw / 2}" class="line" stroke-width="1.2"/>`);
  p.push(`<path d="M480 94 V166" class="line" stroke-width="1.2"/><circle cx="480" cy="94" r="3" class="dot"/><circle cx="480" cy="166" r="3.5" class="dot"/>`);
  p.push(txt(492, 118, "hooks · MCP · REST, bearer secret", { size: 12, cls: "muted sans" }));

  p.push(`<rect x="16" y="128" width="928" height="360" rx="14" class="zone" stroke-width="1.4" stroke-dasharray="6 5"/>`);
  p.push(txt(36, 152, "YOUR MACHINE", { size: 11, cls: "acc sans", weight: 700, ls: 1.6 }));
  p.push(`<path d="M148 141 V156" class="line"/>`);
  p.push(txt(160, 152, "binds to 127.0.0.1 by default", { size: 12.5, weight: 600 }));
  p.push(txt(924, 152, "Keyless by default: nothing leaves until you opt in", { size: 12, cls: "muted sans", anchor: "end" }));

  p.push(`<rect x="36" y="166" width="600" height="104" rx="10" class="hotcard" stroke-width="1.4"/>`);
  p.push(txt(56, 196, "agentmemory server", { size: 17, weight: 700 }));
  p.push(`<rect x="238" y="181" width="52" height="20" rx="10" class="pill"/>`);
  p.push(txt(264, 195, `:${f.restPort}`, { size: 11, cls: "pilltx mono", weight: 700, anchor: "middle" }));
  p.push(txt(56, 224, `REST · ${f.restEndpoints} endpoints  ·  MCP · ${f.mcpTools} tools, ${f.resources} resources, ${f.prompts} prompts`, { size: 12.5 }));
  p.push(txt(56, 248, "Privacy filter on every write · per-agent scope · audit log · circuit breaker", { size: 12, cls: "muted sans" }));

  p.push(`<path d="M636 218 H660" class="line" stroke-width="1.2"/><circle cx="636" cy="218" r="2.5" class="dot"/><circle cx="660" cy="218" r="2.5" class="dot"/>`);
  p.push(`<rect x="660" y="166" width="264" height="104" rx="10" class="card"/>`);
  p.push(txt(680, 196, "Viewer", { size: 17, weight: 700 }));
  p.push(`<rect x="742" y="181" width="52" height="20" rx="10" class="pill"/>`);
  p.push(txt(768, 195, `:${f.viewerPort}`, { size: 11, cls: "pilltx mono", weight: 700, anchor: "middle" }));
  p.push(txt(680, 224, "Sessions, memories, graph, replay", { size: 12.5 }));
  p.push(txt(680, 248, `Live events streamed from :${f.restPort}`, { size: 12, cls: "muted sans" }));

  p.push(`<path d="M336 270 V294 M176 294 H784 M176 294 V318 M480 294 V318 M784 294 V318" class="line" stroke-width="1.2"/>`);
  p.push(`<circle cx="336" cy="270" r="3" class="dot"/>`);
  [176, 480, 784].forEach((x) => p.push(`<circle cx="${x}" cy="318" r="3" class="dot"/>`));

  type Box = { lines: string[]; corner?: string; logos?: string[]; note?: string };
  const lanes: Array<{ x: number; name: string; glyph: string; tag: string; hot?: boolean; top: Box; env: string; bot: Box }> = [
    {
      x: 36, name: "CAPTURE", glyph: "hook", tag: "hook events", hot: true,
      top: { lines: ["Capture pipeline", "Durable inbox, offline spool", "Secrets stripped before storage", "Synthetic compression, no LLM"] },
      env: "AGENTMEMORY_LLM_PROVIDER",
      bot: { lines: ["LLM provider", "Summaries and consolidation"], logos: ["anthropic", "openai", "gemini", "openrouter", "minimax", "ollama"], note: "+ vLLM" },
    },
    {
      x: 340, name: "RECALL", glyph: "search", tag: `RRF fusion, k = ${f.rrfK}`,
      top: { lines: ["Hybrid search", "BM25, always on", "Session-diversified results", `${fmt(f.tokenBudget)}-token context budget`] },
      env: "EMBEDDING_PROVIDER",
      bot: { lines: ["Embedding provider", "Local all-MiniLM-L6-v2, or"], logos: ["huggingface", "gemini", "openai", "voyage", "cohere"], note: "+ OpenRouter" },
    },
    {
      x: 644, name: "STORE", glyph: "store", tag: "versioned",
      top: { lines: ["State store", "File store, no database service", "Four memory tiers, decay, TTL", "Git snapshots and rollback"], corner: "git" },
      env: "AGENTMEMORY_STATE_BACKEND",
      bot: { lines: ["Redis and peers", "Redis state backend", "Mesh sync between instances", "Shared secret on both peers"], corner: "redis" },
    },
  ];
  for (const l of lanes) {
    p.push(`<rect x="${l.x}" y="318" width="280" height="306" rx="12" class="${l.hot ? "hot" : "wash"}"/>`);
    p.push(icon(l.glyph, l.x + 14, 330, 15, "glyph"));
    p.push(txt(l.x + 36, 342, l.name, { size: 11, cls: "acc sans", weight: 700, ls: 1.6 }));
    p.push(txt(l.x + 266, 342, l.tag, { size: 11.5, cls: "muted sans", weight: 600, anchor: "end" }));
    const box = (y: number, b: Box): void => {
      p.push(`<rect x="${l.x + 12}" y="${y}" width="256" height="96" rx="8" class="card"/>`);
      p.push(txt(l.x + 26, y + 26, b.lines[0], { size: 14.5, weight: 700 }));
      b.lines.slice(1).forEach((s, i) => p.push(txt(l.x + 26, y + 48 + i * 18, s, { size: 12, cls: i === 0 ? "ink sans" : "muted sans" })));
      if (b.corner) p.push(icon(b.corner, l.x + 240, y + 12, 18));
      if (b.logos) {
        b.logos.forEach((name, i) => p.push(icon(name, l.x + 26 + i * 26, y + 62, 17)));
        if (b.note) p.push(txt(l.x + 26 + b.logos.length * 26 + 4, y + 75, b.note, { size: 11.5, cls: "muted sans" }));
      }
    };
    box(356, l.top);
    const ew = l.env.length * 6.7 + 22;
    p.push(`<rect x="${l.x + 140 - ew / 2}" y="477" width="${ew}" height="22" rx="11" class="chip"/>`);
    p.push(txt(l.x + 140, 492, l.env, { size: 11, cls: "acc mono", weight: 600, anchor: "middle" }));
    box(514, l.bot);
  }

  return svgWrap(W, H, p.join("\n"),
    "agentmemory architecture: coding agents connect through hooks, MCP and REST to a local server on its REST port with a viewer beside it; capture, recall and store lanes each have a local default and an opt-in provider.");
}

function iso(f: DiagramFacts): string {
  const W = 1060, H = 1130;
  const k = 0.866, h = 0.5;
  const S = 340, D = 120, T = 14, OX = 220, GAP = 172, OY0 = 34;
  const P = (ox: number, oy: number, u: number, v: number, z = 0): [number, number] => [ox + (u - v) * k, oy + (u + v) * h - z];
  const poly = (pts: Array<[number, number]>, cls: string, extra = ""): string => `<polygon points="${pts.map((q) => q.map((n) => n.toFixed(1)).join(",")).join(" ")}" class="${cls}" stroke-width="1"${extra}/>`;
  const mat = (ox: number, oy: number): string => `matrix(${k} ${h} ${-k} ${h} ${ox} ${oy})`;
  const p: string[] = [];
  const layers: Layer[] = [];

  function slab(ox: number, oy: number, w: number, d: number, acc?: boolean): string {
    const top = [P(ox, oy, 0, 0), P(ox, oy, w, 0), P(ox, oy, w, d), P(ox, oy, 0, d)];
    const left = [P(ox, oy, 0, d), P(ox, oy, w, d), P(ox, oy, w, d, -T), P(ox, oy, 0, d, -T)];
    const right = [P(ox, oy, w, 0), P(ox, oy, w, d), P(ox, oy, w, d, -T), P(ox, oy, w, 0, -T)];
    return poly(left, acc ? "aleft" : "left") + poly(right, acc ? "aright" : "right") + poly(top, acc ? "atop" : "top");
  }
  const rectUV = (u: number, v: number, w: number, d: number, cls: string, dash?: boolean): string => `<rect x="${u}" y="${v}" width="${w}" height="${d}" rx="5" class="${cls}"${dash ? ` stroke-dasharray="4 3"` : ""} stroke-width="1"/>`;
  const tUV = (u: number, v: number, s: string, o?: TextOpts): string => txt(u, v, s, o);

  const defs: LayerDef[] = [
    {
      title: "Your agents", lines: ["Claude Code, Codex, Cursor, Copilot CLI,", "OpenCode, Gemini CLI, Hermes, Orca and more."],
      face() {
        const names = ["Claude Code", "Codex", "Cursor", "Copilot CLI", "OpenCode", "Gemini CLI", "Pi", "Hermes", "OpenClaw", "Orca"];
        const out: string[] = [];
        names.forEach((n, i) => {
          const c = i % 5, r = Math.floor(i / 5);
          const u = 6 + c * 66, v = 12 + r * 52;
          out.push(rectUV(u, v, 60, 42, "tile"));
          const logo = AGENT_LOGOS[n];
          if (logo) out.push(icon(logo, u + 23, v + 5, 14));
          out.push(tUV(u + 30, logo ? v + 33 : v + 25, n, { size: 10, weight: 600, anchor: "middle" }));
        });
        return out.join("");
      },
    },
    {
      title: "Hooks, MCP, REST", lines: ["Hooks capture each tool call. MCP and REST", "save and recall, behind a bearer secret."],
      face() {
        const tiles: Array<[string, string]> = [["Hooks", `${f.hooks} lifecycle events`], ["MCP", `${f.mcpTools} tools`], ["REST", `${f.restEndpoints} endpoints`]];
        return tiles.map(([a, b], i) => {
          const u = i * 117;
          return rectUV(u, 16, 106, 88, "tile") + tUV(u + 53, 56, a, { size: 17, weight: 700, anchor: "middle" }) + tUV(u + 53, 78, b, { size: 11, cls: "muted sans", anchor: "middle" });
        }).join("");
      },
    },
    {
      title: "agentmemory server", acc: true, lines: [`One local process: API on :${f.restPort}, viewer on :${f.viewerPort}.`, "Secrets are stripped before anything is stored."],
      face() {
        const tiles: Array<[string, string]> = [["Capture", "privacy filter"], ["Compress", "synthetic"], ["Recall", "hybrid search"], ["Consolidate", "decay, TTL"]];
        return tiles.map(([a, b], i) => {
          const u = i * 87.3;
          return rectUV(u, 16, 78, 88, "atile") + tUV(u + 39, 56, a, { size: 11.5, weight: 700, anchor: "middle" }) + tUV(u + 39, 75, b, { size: 10, cls: "muted sans", anchor: "middle" });
        }).join("");
      },
    },
    {
      title: "Four memory tiers", lines: ["Raw observations become summaries, facts and", "workflows. Stale memories decay and evict."],
      face() {
        const tiers: Array<[string, string, string, string]> = [["WORKING", "raw observations", "t1", "t1x"], ["EPISODIC", "session summaries", "t2", "t1x"], ["SEMANTIC", "facts and patterns", "t3", "t4x"], ["PROCEDURAL", "workflows, decisions", "t4", "t4x"]];
        return tiers.map(([a, b, c, x], i) => {
          const v = 4 + i * 28.5;
          return `<rect x="6" y="${v}" width="328" height="25" rx="4" class="${c}"/>` + tUV(18, v + 17, a, { size: 10.5, cls: `${x} sans`, weight: 700, ls: 1.2 }) + tUV(322, v + 17, b, { size: 10, cls: `${x} sans`, anchor: "end" });
        }).join("");
      },
    },
    {
      title: "Three recall streams", lines: ["BM25 is always on. Vectors and graph join when", `you opt in. Results fuse with RRF, k = ${f.rrfK}.`],
      face() {
        const lanes: Array<[string, string, boolean]> = [["BM25", "always on", false], ["VECTOR", "EMBEDDING_PROVIDER", true], ["GRAPH", "GRAPH_EXTRACTION_ENABLED", true]];
        return lanes.map(([a, b, dash], i) => {
          const v = 5 + i * 38;
          return rectUV(6, v, 328, 32, dash ? "card" : "atile", dash) + tUV(18, v + 21, a, { size: 11, cls: "ink sans", weight: 700, ls: 1.2 }) + tUV(322, v + 21, b, { size: dash ? 8.5 : 10, cls: dash ? "acc mono" : "muted sans", anchor: "end" });
        }).join("");
      },
    },
    {
      title: "Your machine", base: true, lines: ["File state store in the OS data folder.", "Loopback only. Redis and mesh sync are optional."],
      face() {
        const g: string[] = [];
        for (let u = 40; u < 380; u += 40) g.push(`<path d="M${u} 0 V160" class="guide"/>`);
        for (let v = 40; v < 160; v += 40) g.push(`<path d="M0 ${v} H380" class="guide"/>`);
        const rows: Array<[string, string]> = [["macOS", "~/Library/Application Support/agentmemory"], ["Linux", "$XDG_DATA_HOME/agentmemory"], ["Windows", "%APPDATA%\\agentmemory"]];
        return g.join("") + icon("store", 22, 21, 16, "glyph") + tUV(44, 34, "FILE STATE STORE", { size: 11, cls: "acc sans", weight: 700, ls: 1.4 }) + rows.map(([os, path], j) => tUV(24, 66 + j * 26, os, { size: 11, weight: 700 }) + tUV(92, 66 + j * 26, path, { size: 11, cls: "muted mono" })).join("");
      },
    },
  ];

  const guides: string[] = [];
  defs.forEach((d, i) => {
    const pad = d.base ? 20 : 0;
    const w = S + pad * 2, dd = D + pad * 2;
    const oy = OY0 + i * GAP;
    const ox = OX;
    const o = P(ox, oy, -pad, -pad);
    layers.push({ d, ox: o[0], oy: o[1], w, dd, i });
  });
  const first = layers[0];
  for (const [u, v] of [[0, D], [S, 0], [S, D]]) {
    const a = P(first.ox, first.oy, u, v), b = P(OX, OY0 + 5 * GAP, u, v);
    guides.push(`<path d="M${a[0].toFixed(1)} ${a[1].toFixed(1)} V${(b[1] + 20).toFixed(1)}" class="guide"/>`);
  }
  p.push(guides.join(""));
  const yTop = OY0 + 60, yBot = OY0 + 4 * GAP + 120;
  p.push(`<path d="M30 ${yTop} V${yBot}" class="line" stroke-width="1.2"/><circle cx="30" cy="${yTop}" r="3" class="dot"/>`);
  p.push(`<path d="M62 ${yTop} V${yBot}" class="line" stroke-width="1.2"/><circle cx="62" cy="${yBot}" r="3" class="dot"/>`);
  p.push(`<text transform="translate(24 ${(yTop + yBot) / 2}) rotate(-90)" class="acc sans" font-size="11" font-weight="700" letter-spacing="1.4" text-anchor="middle">WRITE PATH · DOWN, EVERY TOOL CALL</text>`);
  p.push(`<text transform="translate(56 ${(yTop + yBot) / 2}) rotate(-90)" class="muted sans" font-size="11" font-weight="700" letter-spacing="1.4" text-anchor="middle">READ PATH · UP, SESSION START AND RECALL</text>`);

  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i];
    p.push(slab(L.ox, L.oy, L.w, L.dd, L.d.acc));
    p.push(`<g transform="${mat(L.ox, L.oy)}">${L.d.face()}</g>`);
  }
  for (const L of layers) {
    const c = P(L.ox, L.oy, L.w, 0);
    const ly = L.oy + 92;
    const lx = 660;
    p.push(`<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="3.2" class="dot"/>`);
    p.push(`<path d="M${(c[0] + 4).toFixed(1)} ${c[1].toFixed(1)} L${lx - 30} ${c[1].toFixed(1)} L${lx - 14} ${ly - 6}" class="line"/>`);
    p.push(txt(lx, ly, L.d.title, { size: 24, weight: 700 }));
    L.d.lines.forEach((s, j) => p.push(txt(lx, ly + 26 + j * 22, s, { size: 15.5, cls: "muted sans" })));
  }
  return svgWrap(W, H, p.join("\n"), "agentmemory exploded view: agents, hooks/MCP/REST, the agentmemory server, four memory tiers, three recall streams, and the local machine that stores everything.");
}


function pipeline(f: DiagramFacts): string {
  const W = 960, H = 560;
  const p: string[] = [];
  const BW = 118, G = 14, X0 = 166;
  const col = (i: number): number => X0 + i * (BW + G);
  const box = (i: number, y: number, lines: string[], opt: { n?: number; hot?: boolean; dash?: boolean } = {}): void => {
    const x = col(i);
    p.push(`<rect x="${x}" y="${y}" width="${BW}" height="78" rx="8" class="${opt.hot ? "hotcard" : "card"}"${opt.dash ? ' stroke-dasharray="4 3"' : ""}/>`);
    p.push(txt(x + 12, y + 22, lines[0], { size: 13, weight: 700 }));
    if (opt.n) p.push(txt(x + BW - 10, y + 70, String(opt.n).padStart(2, "0"), { size: 10, cls: "faint mono", anchor: "end" }));
    lines.slice(1).forEach((s, j) => p.push(txt(x + 12, y + 42 + j * 16, s, { size: 11, cls: s.startsWith("$") ? "acc mono" : "muted sans" })));
  };
  const flow = (y: number, n: number): void => {
    p.push(`<path d="M${col(0) + BW} ${y + 39} H${col(n - 1)}" class="line" stroke-width="1.2"/>`);
  };
  const lane = (y: number, hook: string, sub: string, tone: string): void => {
    p.push(`<rect x="16" y="${y - 12}" width="928" height="102" rx="12" class="${tone}"/>`);
    p.push(txt(32, y + 22, hook, { size: 12.5, cls: "acc mono", weight: 700 }));
    p.push(txt(32, y + 42, sub, { size: 11.5, cls: "muted sans" }));
  };
  p.push(txt(16, 24, "MEMORY PIPELINE", { size: 11, cls: "acc sans", weight: 700, ls: 1.6 }));
  p.push(txt(944, 24, "dashed = opt-in", { size: 11.5, cls: "muted sans", anchor: "end" }));

  lane(48, "PostToolUse", "every tool call", "hot");
  flow(48, 6);
  box(0, 48, ["Event", "stable event ID", "dedupe on replay"], { n: 1 });
  box(1, 48, ["Inbox", "durable capture", "spool if offline"], { n: 2 });
  box(2, 48, ["Privacy filter", "keys, tokens, URLs", "<private> tags"], { n: 3, hot: true });
  box(3, 48, ["Observation", "raw, per session", "provenance stamp"], { n: 4 });
  box(4, 48, ["Compress", "synthetic default", "LLM opt-in"], { n: 5 });
  box(5, 48, ["Index", "BM25 always", "vectors opt-in"], { n: 6 });

  lane(170, "Stop · SessionEnd", "end of turn or session", "wash");
  flow(170, 3);
  box(0, 170, ["Summary", "incremental, only", "new observations"], { n: 1 });
  box(1, 170, ["Graph", "entities and", "relations"], { n: 2, dash: true });
  box(2, 170, ["Reflection", "updates memory", "slots"], { n: 3, dash: true });

  const sy = 292;
  p.push(`<rect x="16" y="${sy}" width="928" height="58" rx="10" class="hotcard" stroke-width="1.4"/>`);
  p.push(icon("store", 32, sy + 13, 15, "glyph"));
  p.push(txt(52, sy + 25, "STATE STORE", { size: 11, cls: "acc sans", weight: 700, ls: 1.6 }));
  p.push(txt(32, sy + 43, "file store by default", { size: 11.5, cls: "muted sans" }));
  const tiers: Array<[string, string, string]> = [["Working", "t1", "t1x"], ["Episodic", "t2", "t1x"], ["Semantic", "t3", "t4x"], ["Procedural", "t4", "t4x"]];
  tiers.forEach(([n, c, x], i) => {
    const tx = col(0) + i * 112;
    p.push(`<rect x="${tx}" y="${sy + 15}" width="104" height="28" rx="6" class="${c}"/>`);
    p.push(txt(tx + 52, sy + 33, n, { size: 11.5, cls: `${x} sans`, weight: 700, anchor: "middle" }));
  });
  p.push(txt(928, sy + 25, "decay · TTL · contradiction checks", { size: 11.5, weight: 600, anchor: "end" }));
  p.push(txt(928, sy + 43, "git snapshots · version chains", { size: 11.5, cls: "muted sans", anchor: "end" }));

  const down = (x: number, y1: number, y2: number): number => p.push(`<path d="M${x} ${y1} V${y2}" class="line" stroke-width="1.2"/><circle cx="${x}" cy="${y2}" r="3" class="dot"/>`);
  down(col(3) + BW / 2, 126, sy);
  down(col(5) + BW / 2, 126, sy);
  down(col(0) + BW / 2, 248, sy);
  down(col(1) + BW / 2, 248, sy);
  down(col(2) + BW / 2, 248, sy);

  lane(392, "SessionStart", "new session", "wash");
  flow(392, 4);
  box(0, 392, ["Profile", "top concepts,", "files, patterns"], { n: 1 });
  box(1, 392, ["Hybrid search", "BM25 + vector", `+ graph, RRF k=${f.rrfK}`], { n: 2 });
  box(2, 392, ["Token budget", `${fmt(f.tokenBudget)} by default`, `max ${f.maxPerSession} per session`], { n: 3 });
  box(3, 392, ["Inject context", "when the host", "allows it"], { n: 4, dash: true });
  [0, 1].forEach((i) => p.push(`<path d="M${col(i) + BW / 2} ${sy + 58} V392" class="line" stroke-width="1.2"/><circle cx="${col(i) + BW / 2}" cy="${sy + 58}" r="3" class="dot"/>`));
  p.push(`<path d="M${col(3) + BW} 431 H${col(4) + 24}" class="line" stroke-width="1.2"/><circle cx="${col(4) + 24}" cy="431" r="3" class="dot"/>`);
  p.push(txt(col(4) + 36, 427, "agent prompt", { size: 12.5, weight: 700 }));
  p.push(txt(col(4) + 36, 445, "$AGENTMEMORY_INJECT_CONTEXT=true", { size: 10.5, cls: "acc mono" }));

  p.push(txt(16, 500, "Opt-in switches: AGENTMEMORY_AUTO_COMPRESS · EMBEDDING_PROVIDER · GRAPH_EXTRACTION_ENABLED · AGENTMEMORY_SLOTS + AGENTMEMORY_REFLECT", { size: 11, cls: "acc mono" }));
  p.push(txt(16, 520, "Keyless installs skip every dashed step and all LLM calls: synthetic compression and BM25 recall still work.", { size: 12, cls: "muted sans" }));
  p.push(txt(16, 540, "Secrets are scrubbed on every write path, including imports, mesh sync, summaries and graph nodes.", { size: 12, cls: "muted sans" }));

  return svgWrap(W, H, p.join("\n"),
    "agentmemory memory pipeline: PostToolUse captures, filters, stores, compresses and indexes each tool call; Stop and SessionEnd summarize; SessionStart builds a profile, runs hybrid search within a token budget and injects context.");
}

function svgWrap(w: number, h: number, body: string, label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">
${STYLE}
${body}
</svg>
`;
}

export function renderReadmeDiagrams(f: DiagramFacts): Record<string, string> {
  return {
    "assets/diagrams/architecture.svg": architecture(f),
    "assets/diagrams/pipeline.svg": pipeline(f),
    "assets/diagrams/stack.svg": iso(f),
  };
}
