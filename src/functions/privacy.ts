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

const PRIVATE_KEY_BLOCK_RE =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|$)/g;

const URL_CREDENTIALS_RE =
  /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/?#@:"'<>]*:[^\s/?#@"'<>]+@/gi;

export function stripPrivateData(input: string): string {
  let result = input.replace(PRIVATE_TAG_RE, "[REDACTED]");
  result = result.replace(new RegExp(PRIVATE_KEY_BLOCK_RE.source, PRIVATE_KEY_BLOCK_RE.flags), "[REDACTED_SECRET]");
  result = result.replace(new RegExp(URL_CREDENTIALS_RE.source, URL_CREDENTIALS_RE.flags), "$1[REDACTED_SECRET]@");
  for (const source of SECRET_PATTERN_SOURCES) {
    const pattern = new RegExp(source.source, source.flags);
    result = result.replace(pattern, "[REDACTED_SECRET]");
  }
  return result;
}

export function scrubRecord<T>(value: T): T {
  if (typeof value === "string") return stripPrivateData(value) as T;
  if (Array.isArray(value)) return value.map((item) => scrubRecord(item)) as T;
  if (value !== null && typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = scrubRecord(item);
    }
    return out as T;
  }
  return value;
}

export const SCRUBBED_WRITE_FUNCTIONS: ReadonlySet<string> = new Set([
  "mem::remember",
  "mem::evolve",
  "mem::slot-create",
  "mem::slot-append",
  "mem::slot-replace",
  "mem::lesson-save",
  "mem::action-create",
  "mem::action-update",
  "mem::sketch-create",
  "mem::sketch-add",
  "mem::import",
  "mem::mesh-receive",
  "mem::team-share",
  "mem::signal-send",
  "mem::routine-create",
  "mem::checkpoint-create",
  "mem::checkpoint-resolve",
  "mem::sentinel-create",
  "mem::sentinel-trigger",
  "mem::core-add",
  "mem::facet-tag",
]);

type RegisterFunction = (id: string, handler: unknown, ...rest: unknown[]) => unknown;

export function withWriteScrubbing<T extends object>(sdk: T): T {
  return new Proxy(sdk, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      if (prop !== "registerFunction") return value.bind(target);
      const register = value as RegisterFunction;
      return (id: string, handler: unknown, ...rest: unknown[]) => {
        if (!SCRUBBED_WRITE_FUNCTIONS.has(id) || typeof handler !== "function") {
          return register.call(target, id, handler, ...rest);
        }
        const original = handler as (data: unknown, ...args: unknown[]) => unknown;
        const scrubbed = (data: unknown, ...args: unknown[]) => original(scrubRecord(data), ...args);
        return register.call(target, id, scrubbed, ...rest);
      };
    },
  });
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
