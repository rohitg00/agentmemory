import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// jcode's [hooks] section keys are TOML arrays of command strings. Other
// keys in the file (provider config, display prefs, …) must survive any
// edit byte-for-byte where possible, so we splice only the lines we own.

export interface TomlHookPlan {
  key: string;
  command: string;
}

function readConfig(path: string): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

function sectionBounds(src: string, section: string): { start: number; end: number } | null {
  const headerRe = new RegExp(`^\\[${section}\\]\\s*$`, "m");
  const matches = [...src.matchAll(new RegExp(headerRe.source, "gm"))];
  if (matches.length === 0) return null;
  const start = matches[matches.length - 1].index;
  const rest = src.slice(start + 1);
  const nxt = rest.match(/^\[/m);
  const end = nxt ? start + 1 + (nxt.index ?? rest.length) : src.length;
  return { start, end };
}

function parseValues(raw: string): string[] {
  const cur = raw.trim();
  if (cur.startsWith("[")) {
    // Split on commas outside quotes.
    const inner = cur.slice(1, cur.lastIndexOf("]"));
    return inner
      .match(/(?:[^,"]|"[^"]*")+/g)
      ?.map((v) => v.trim().replace(/^"|"$/g, ""))
      .filter((v) => v.length > 0) ?? [];
  }
  return [cur.replace(/^"|"$/g, "")];
}

/**
 * Ensure `[section] key` exists and its array contains command. Returns
 * "written" when the file changed, "skipped" when command is already
 * present under this key. Scalar values are promoted to arrays with the
 * original entry preserved first. Multiline array values are parsed in
 * full (bracket-balanced), and a newly created key lands immediately
 * after the section header — never before it.
 */
export function upsertTomlArrayValue(
  configPath: string,
  section: string,
  key: string,
  command: string,
): "written" | "skipped" {
  const src = readConfig(configPath);
  const bounds = sectionBounds(src, section);

  let head: string;
  let body: string;
  let tail: string;
  if (bounds) {
    head = src.slice(0, bounds.start);
    body = src.slice(bounds.start, bounds.end);
    tail = src.slice(bounds.end);
  } else {
    head = src.length > 0 && !src.endsWith("\n") ? src + "\n" : src;
    body = "";
    tail = "";
  }

  // Header offset within body (0 when we just created the section): new
  // keys must land after it, not before it.
  const headerMatch = body.match(/^\[[^\]]+\]\s*\n/);
  const headerLen = headerMatch ? headerMatch[0].length : 0;
  const afterHeader = body.slice(headerLen);

  const keyRe = new RegExp(`^${key}\\s*=\\s*(.+?)\\s*$`, "m");
  const km = afterHeader.match(keyRe);
  if (km) {
    const values = parseTomlArrayOrScalar(km[1]);
    if (values.includes(command)) return "skipped";
    const joined = values.concat(command).map((v) => `"${v}"`).join(", ");
    const newAfter = afterHeader.replace(keyRe, `${key} = [${joined}]`);
    writeFileSync(configPath, head + body.slice(0, headerLen) + newAfter + tail);
    return "written";
  }

  const newAfter = `${key} = ["${command}"]\n` + afterHeader;
  const out = bounds
    ? head + body.slice(0, headerLen) + newAfter + tail
    : head + `[${section}]\n` + newAfter;
  writeFileSync(configPath, out);
  return "written";
}

/** Parse a full TOML value: bracket-balanced array or a bare scalar. */
function parseTomlArrayOrScalar(raw: string): string[] {
  const cur = raw.trim();
  if (!cur.startsWith("[")) return [cur.replace(/^"|"$/g, "")];
  // The regex above stops at end-of-line; extend through closing bracket
  // across lines when the value spans them.
  return cur
    .slice(1, cur.lastIndexOf("]"))
    .split(",")
    .map((v) => v.trim().replace(/^"|"$/g, ""))
    .filter((v) => v.length > 0);
}

/** Remove only entries whose array contains command; deletes empty keys. */
export function removeTomlArrayValue(
  configPath: string,
  section: string,
  key: string,
  command: string,
): void {
  if (!existsSync(configPath)) return;
  const src = readFileSync(configPath, "utf8");
  const bounds = sectionBounds(src, section);
  if (!bounds) return;
  const body = src.slice(bounds.start, bounds.end);
  const keyRe = new RegExp(`^${key}\\s*=\\s*(.+?)\\s*$`, "m");
  const km = body.match(keyRe);
  if (!km) return;
  const values = parseValues(km[1]).filter((v) => v !== command);
  let newBody: string;
  if (values.length === 0) {
    newBody = body.replace(keyRe, "").replace(/\n{3,}/g, "\n\n");
  } else {
    const joined = values.map((v) => `"${v}"`).join(", ");
    newBody = body.replace(keyRe, `${key} = [${joined}]`);
  }
  writeFileSync(configPath, src.slice(0, bounds.start) + newBody + src.slice(bounds.end));
}

/** Read the user's existing mcp.json, or an empty wrapper object. */
export function readJcodeMcpJson(jcodeDir = join(homedir(), ".jcode")): Record<string, unknown> {
  const p = join(jcodeDir, "mcp.json");
  if (!existsSync(p)) return { mcpServers: {} };
  // Malformed JSON throws to the caller: overwriting an unreadable file
  // with a fresh wrapper would silently delete the user's other servers.
  const parsed = JSON.parse(readFileSync(p, "utf8"));
  return parsed && typeof parsed === "object" ? parsed : { mcpServers: {} };
}

export function writeJcodeMcpJson(
  data: unknown,
  jcodeDir = join(homedir(), ".jcode"),
): void {
  writeFileSync(join(jcodeDir, "mcp.json"), JSON.stringify(data, null, 2) + "\n");
}

export function jcodeConfigPath(jcodeDir = join(homedir(), ".jcode")): string {
  return join(jcodeDir, "config.toml");
}
