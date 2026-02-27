import type { ISdk } from "iii-sdk";

const PRIVATE_TAG_RE = /<private>[\s\S]*?<\/private>/gi;

const SECRET_PATTERN_SOURCES = [
  /(?:api[_-]?key|secret|token|password|credential|auth)[\s]*[=:]\s*["']?[A-Za-z0-9_\-/.+]{20,}["']?/gi,
  /(?:sk|pk|rk|ak)-[A-Za-z0-9]{20,}/g,
  /sk-ant-[A-Za-z0-9\-_]{20,}/g,
  /ghp_[A-Za-z0-9]{36}/g,
  /github_pat_[A-Za-z0-9_]{22,}/g,
  /xoxb-[A-Za-z0-9\-]+/g,
  /AKIA[0-9A-Z]{16}/g,
  /AIza[A-Za-z0-9\-_]{35}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
];

export function stripPrivateData(input: string): string {
  let result = input.replace(PRIVATE_TAG_RE, "[REDACTED]");
  for (const source of SECRET_PATTERN_SOURCES) {
    const pattern = new RegExp(source.source, source.flags);
    result = result.replace(pattern, "[REDACTED_SECRET]");
  }
  return result;
}

export function registerPrivacyFunction(sdk: ISdk): void {
  sdk.registerFunction(
    {
      id: "mem::privacy",
      description: "Strip private tags and secrets from input",
    },
    async (data: { input: string }) => {
      return { output: stripPrivateData(data.input) };
    },
  );
}
