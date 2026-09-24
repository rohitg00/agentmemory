import type { IIIClient } from "iii-sdk";

const PRIVATE_TAG_RE = /<private>[\s\S]*?<\/private>/gi;

const SECRET_PATTERN_SOURCES = [
  /(?:api[_-]?key|secret|token|password|credential|auth)[\s]*[=:]\s*["']?[A-Za-z0-9_\-/.+]{20,}["']?/gi,
  /Bearer\s+[A-Za-z0-9._\-+/=]{20,}/gi,
  /sk-proj-[A-Za-z0-9\-_]{20,}/g,
  /(?:sk|pk|rk|ak)-[A-Za-z0-9][A-Za-z0-9\-_]{19,}/g,
  /sk-ant-[A-Za-z0-9\-_]{20,}/g,
  /gh[pus]_[A-Za-z0-9]{36,}/g,
  /github_pat_[A-Za-z0-9_]{22,}/g,
  /xoxb-[A-Za-z0-9\-]+/g,
  /AKIA[0-9A-Z]{16}/g,
  /AIza[A-Za-z0-9\-_]{35}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /npm_[A-Za-z0-9]{36}/g,
  /glpat-[A-Za-z0-9\-_]{20,}/g,
  /dop_v1_[A-Za-z0-9]{64}/g,
];

export function stripPrivateData(input: string): string {
  let result = input.replace(PRIVATE_TAG_RE, "[REDACTED]");
  for (const source of SECRET_PATTERN_SOURCES) {
    const pattern = new RegExp(source.source, source.flags);
    result = result.replace(pattern, "[REDACTED_SECRET]");
  }
  return result;
}

export function registerPrivacyFunction(sdk: IIIClient): void {
  sdk.registerFunction("mem::privacy", 
    async (data: { input?: unknown } | undefined) => {
      if (!data || typeof data.input !== "string") {
        return { output: "", error: "invalid input: expected string field 'input'" };
      }
      return { output: stripPrivateData(data.input) };
    },
  );
}
