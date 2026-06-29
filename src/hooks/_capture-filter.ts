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
  const pat = normalizePattern(pattern);
  if (!pat.includes("*")) return bare === pat;
  const escaped = pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
  return re.test(bare) || re.test(toolName.toLowerCase());
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

export function preCompactBudget(): number {
  const raw = process.env["AGENTMEMORY_PRE_COMPACT_BUDGET"];
  if (raw?.trim() === "0") return 0;
  if (!raw?.trim()) return 1500;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1500;
}
