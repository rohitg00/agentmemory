// Terminal-width-aware splash banner for the agentmemory CLI.
//
// Three render tiers, picked from `process.stdout.columns`:
//
//   >= 120 cols: full block-art logo + tagline.
//   80–119 cols: compact monospace title + tagline.
//   <  80 cols: single-line `agentmemory v<VERSION>`.
//
// The brand accent is the orange `#FF6B35` we already use in the README
// and viewer; we render it through ANSI 38;5;208 (the closest xterm-256
// match) when stdout is a TTY, and fall back to plain text otherwise.
// No colour bytes are hard-coded into the strings themselves so that
// piping the banner to a file (`agentmemory > log`) stays clean.
//
// We don't pull in chalk/picocolors — picocolors is a transitive dep but
// we never want to depend on transitives directly. The two ANSI escape
// helpers below are the entire colour surface and they degrade to
// no-ops automatically.

const IS_COLOR_TTY = !!process.stdout.isTTY && !process.env["NO_COLOR"];

function accent(s: string): string {
  // 256-colour orange that visually matches #FF6B35 in most modern
  // terminal palettes. We pick 208 (a true orange) over the closer-but-
  // pinker 209 because it reads as the brand colour on both dark and
  // light backgrounds.
  return IS_COLOR_TTY ? `\x1b[38;5;208m${s}\x1b[0m` : s;
}

function dim(s: string): string {
  return IS_COLOR_TTY ? `\x1b[2m${s}\x1b[22m` : s;
}

function bold(s: string): string {
  return IS_COLOR_TTY ? `\x1b[1m${s}\x1b[22m` : s;
}

function getTerminalWidth(): number {
  const w = process.stdout.columns;
  return typeof w === "number" && w > 0 ? w : 80;
}

const TAGLINE = "Persistent memory for AI coding agents";

// "agentmemory" rendered in figlet's standard font (verified output —
// regenerate via `figlet agentmemory` if you change the wordmark). Each
// row is exactly 70 columns wide so the banner aligns cleanly inside
// the 2-col left margin we add below.
function fullBanner(version: string): string {
  const logo = [
    "                        _                                             ",
    "  __ _  __ _  ___ _ __ | |_ _ __ ___   ___ _ __ ___   ___  _ __ _   _ ",
    " / _` |/ _` |/ _ \\ '_ \\| __| '_ ` _ \\ / _ \\ '_ ` _ \\ / _ \\| '__| | | |",
    "| (_| | (_| |  __/ | | | |_| | | | | |  __/ | | | | | (_) | |  | |_| |",
    " \\__,_|\\__, |\\___|_| |_|\\__|_| |_| |_|\\___|_| |_| |_|\\___/|_|   \\__, |",
    "       |___/                                                    |___/ ",
  ];
  const lines: string[] = ["", ...logo.map((line) => "  " + accent(line))];
  lines.push("");
  lines.push("  " + bold(TAGLINE) + "  " + dim(`v${version}`));
  lines.push("");
  return lines.join("\n");
}

function compactBanner(version: string): string {
  const title = "  " + bold(accent("agentmemory"));
  const meta = "  " + dim(`v${version} · ${TAGLINE}`);
  return ["", title, meta, ""].join("\n");
}

function minimalBanner(version: string): string {
  return `${accent("agentmemory")} ${dim(`v${version}`)}`;
}

export function renderSplash(version: string): void {
  const width = getTerminalWidth();
  let out: string;
  if (width >= 120) {
    out = fullBanner(version);
  } else if (width >= 80) {
    out = compactBanner(version);
  } else {
    out = minimalBanner(version);
  }
  process.stdout.write(out + "\n");
}
