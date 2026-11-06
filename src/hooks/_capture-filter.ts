import { stripPrivateData, stripSecrets } from "../functions/privacy.js";

const DEFAULT_DENY_PATTERNS = [
  "memory_*",
  "toolsearch",
  "listmcpresources",
  "fetchmcpresource",
];

function parseEnvList(raw: string | undefined): string[] | undefined {
  if (!raw?.trim()) return undefined;
  return raw
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function bareToolName(toolName: string): string {
  const trimmed = toolName.trim();
  if (/^mcp__/i.test(trimmed)) {
    const parts = trimmed.split("__");
    if (parts.length >= 3) return parts[parts.length - 1]!;
  }
  return trimmed;
}

function normalizePattern(pattern: string): string {
  return pattern.trim().toLowerCase();
}

function matchesPattern(toolName: string, pattern: string): boolean {
  const bare = bareToolName(toolName).toLowerCase();
  const full = toolName.trim().toLowerCase();
  const pat = normalizePattern(pattern);
  if (!pat.includes("*")) return bare === pat || full === pat;
  const escaped = pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
  return re.test(bare) || re.test(full);
}

function matchesAny(toolName: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesPattern(toolName, pattern));
}

export function shouldCaptureTool(toolName: unknown): boolean {
  if (typeof toolName !== "string" || !toolName.trim()) return true;

  const allow = parseEnvList(process.env["AGENTMEMORY_CAPTURE_ALLOW"]);
  if (allow) return matchesAny(toolName, allow);

  const deny = [
    ...DEFAULT_DENY_PATTERNS,
    ...(parseEnvList(process.env["AGENTMEMORY_CAPTURE_DENY"]) ?? []),
  ];
  return !matchesAny(toolName, deny);
}

export function captureOutputMax(): number {
  const raw = process.env["AGENTMEMORY_CAPTURE_OUTPUT_MAX"];
  if (!raw?.trim()) return 8000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8000;
}

function cut(value: string, max: number): string {
  if (value.length <= max) return value;
  const end = /[\uD800-\uDBFF]/.test(value[max - 1] ?? "") ? max - 1 : max;
  return value.slice(0, end);
}

export function truncateText(value: string, max: number): string {
  if (value.length <= max) return value;
  return cut(stripPrivateData(value), max);
}

const JSON_WHITESPACE_ESCAPES: Record<string, string> = { n: "\n", r: "\r", t: "\t" };

function scrubSecrets(value: unknown): unknown {
  if (typeof value === "string") return stripSecrets(value);
  if (Array.isArray(value)) return value.map(scrubSecrets);
  if (value !== null && typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [stripSecrets(key), scrubSecrets(item)]));
  }
  return value;
}

function redactSerialized(serialized: string): string {
  const unescaped = serialized.replace(/\\([\\nrt])/g, (escape, c: string) => JSON_WHITESPACE_ESCAPES[c] ?? escape);
  return stripPrivateData(unescaped).replace(/[\n\r\t]/g, (c) => JSON.stringify(c).slice(1, -1));
}

export function truncateJson(value: unknown, max: number): string {
  const str = JSON.stringify(value);
  if (str.length <= max) return str;
  return cut(redactSerialized(JSON.stringify(scrubSecrets(value))), max);
}

function truncateWithSuffix(value: string, max: number, suffix: string): string {
  const safe = stripPrivateData(value);
  if (safe.length <= max) return safe;
  return max <= suffix.length ? suffix.slice(0, max) : cut(safe, max - suffix.length) + suffix;
}

export function truncateCaptureOutput(value: unknown, max: number): unknown {
  if (typeof value === "string" && value.length > max) {
    return truncateWithSuffix(value, max, "\n[...truncated]");
  }
  if (typeof value === "object" && value !== null) {
    const str = JSON.stringify(value);
    if (str.length > max) return truncateWithSuffix(redactSerialized(JSON.stringify(scrubSecrets(value))), max, "...[truncated]");
    return value;
  }
  return value;
}

export function preCompactBudget(): number {
  const raw = process.env["AGENTMEMORY_PRE_COMPACT_BUDGET"];
  if (raw?.trim() === "0") return 0;
  if (!raw?.trim()) return 1500;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1500;
}
