import type { ISdk } from "iii-sdk";
import type {
  MemoryPolicy,
  MemoryWriteCandidate,
  MemoryWritePolicy,
  PreflightRule,
  QueryExpansion,
  QueryExpansionRule,
} from "../types.js";
import { KV } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { recordAudit } from "./audit.js";

const POLICY_ID = "default";
const DEFAULT_WRITE_POLICY: MemoryWritePolicy = {
  mode: "shadow",
  autoWriteThreshold: 0.85,
  allowedAutoTypes: ["preference", "workflow"],
  neverAutoWriteShared: true,
};
const VALID_CANDIDATE_TYPES = new Set<MemoryWriteCandidate["memoryType"]>([
  "fact",
  "preference",
  "architecture",
  "bug",
  "workflow",
  "lesson",
  "procedural_rule",
  "credential_route",
  "temporary",
  "ignore",
]);

function nowIso(): string {
  return new Date().toISOString();
}

function defaultPolicy(timestamp = nowIso()): MemoryPolicy {
  return {
    id: POLICY_ID,
    updatedAt: timestamp,
    queryExpansions: [],
    writePolicy: { ...DEFAULT_WRITE_POLICY },
    preflightRules: [],
  };
}

async function readPolicy(kv: StateKV): Promise<MemoryPolicy> {
  const stored = await kv.get<MemoryPolicy>(KV.memoryPolicy, POLICY_ID);
  if (!stored) return defaultPolicy();
  return normalizePolicy(stored);
}

function asString(value: unknown, max = 256): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function uniqueStrings(values: unknown, maxItems: number, maxLen = 128): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = asString(value, maxLen);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= maxItems) break;
  }
  return result;
}

function normalizeQueryRule(raw: unknown, timestamp: string): QueryExpansionRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<QueryExpansionRule>;
  const id = asString(r.id, 96);
  const trigger = asString(r.trigger, 128);
  if (!id || !trigger) return null;
  const scope =
    r.scope === "global" || r.scope === "project" ? r.scope : "global";
  const rule: QueryExpansionRule = {
    id,
    trigger,
    expansions: uniqueStrings(r.expansions, 20),
    scope,
    enabled: r.enabled !== false,
    createdAt: asString(r.createdAt, 64) ?? timestamp,
    updatedAt: timestamp,
  };
  if (scope === "project") {
    const project = asString(r.project, 256);
    if (!project) return null;
    rule.project = project;
  }
  return rule;
}

function normalizeWritePolicy(raw: unknown): MemoryWritePolicy {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_WRITE_POLICY };
  const r = raw as Partial<MemoryWritePolicy>;
  const mode =
    r.mode === "disabled" || r.mode === "limited_auto" || r.mode === "shadow"
      ? r.mode
      : DEFAULT_WRITE_POLICY.mode;
  const threshold =
    typeof r.autoWriteThreshold === "number" &&
    Number.isFinite(r.autoWriteThreshold)
      ? Math.max(0, Math.min(1, r.autoWriteThreshold))
      : DEFAULT_WRITE_POLICY.autoWriteThreshold;
  const allowedAutoTypes = uniqueStrings(r.allowedAutoTypes, 20).filter(
    (type): type is MemoryWriteCandidate["memoryType"] =>
      VALID_CANDIDATE_TYPES.has(type as MemoryWriteCandidate["memoryType"]),
  );
  return {
    mode,
    autoWriteThreshold: threshold,
    allowedAutoTypes:
      allowedAutoTypes.length > 0
        ? allowedAutoTypes
        : [...DEFAULT_WRITE_POLICY.allowedAutoTypes],
    neverAutoWriteShared: r.neverAutoWriteShared !== false,
  };
}

function normalizePreflightRule(raw: unknown, timestamp: string): PreflightRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<PreflightRule>;
  const id = asString(r.id, 96);
  const tool = asString(r.tool, 128);
  const taskType = asString(r.taskType, 128);
  if (!id || !tool || !taskType) return null;
  const decision =
    r.decision === "block" || r.decision === "warn" || r.decision === "allow"
      ? r.decision
      : "warn";
  return {
    id,
    tool,
    taskType,
    triggerPatterns: uniqueStrings(r.triggerPatterns, 20),
    decision,
    enabled: r.enabled !== false,
    createdAt: asString(r.createdAt, 64) ?? timestamp,
    updatedAt: timestamp,
  };
}

function normalizePolicy(raw: Partial<MemoryPolicy>): MemoryPolicy {
  const timestamp = nowIso();
  const queryExpansions = Array.isArray(raw.queryExpansions)
    ? raw.queryExpansions
        .map((rule) => normalizeQueryRule(rule, timestamp))
        .filter((rule): rule is QueryExpansionRule => rule !== null)
    : [];
  const preflightRules = Array.isArray(raw.preflightRules)
    ? raw.preflightRules
        .map((rule) => normalizePreflightRule(rule, timestamp))
        .filter((rule): rule is PreflightRule => rule !== null)
    : [];
  return {
    id: POLICY_ID,
    updatedAt: timestamp,
    queryExpansions,
    writePolicy: normalizeWritePolicy(raw.writePolicy),
    preflightRules,
  };
}

function matchesRule(rule: QueryExpansionRule, query: string, project?: string): boolean {
  if (!rule.enabled) return false;
  if (rule.scope === "project" && rule.project !== project) return false;
  return query.toLowerCase().includes(rule.trigger.toLowerCase());
}

function expandFromPolicy(
  policy: MemoryPolicy,
  query: string,
  project: string | undefined,
  maxQueries: number,
): QueryExpansion {
  const seen = new Set<string>([query.toLowerCase()]);
  const reformulations: string[] = [];
  for (const rule of policy.queryExpansions) {
    if (!matchesRule(rule, query, project)) continue;
    for (const expansion of rule.expansions) {
      const key = expansion.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      reformulations.push(expansion);
      if (reformulations.length >= maxQueries) {
        return {
          original: query,
          reformulations,
          temporalConcretizations: [],
          entityExtractions: [],
        };
      }
    }
  }
  return {
    original: query,
    reformulations,
    temporalConcretizations: [],
    entityExtractions: [],
  };
}

export function registerMemoryPolicyFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction("mem::policy-get", async () => ({
    success: true,
    policy: await readPolicy(kv),
  }));

  sdk.registerFunction(
    "mem::policy-update",
    async (data: Partial<MemoryPolicy> | undefined) => {
      const policy = normalizePolicy(data ?? {});
      await kv.set(KV.memoryPolicy, POLICY_ID, policy);
      await recordAudit(kv, "policy_update", "mem::policy-update", [POLICY_ID], {
        queryExpansionRules: policy.queryExpansions.length,
        preflightRules: policy.preflightRules.length,
        mode: policy.writePolicy.mode,
      });
      return { success: true, policy };
    },
  );

  sdk.registerFunction(
    "mem::policy-expand-query",
    async (data: { query?: string; project?: string; maxQueries?: number }) => {
      const query = asString(data?.query, 500);
      if (!query) return { success: false, error: "query is required" };
      const rawMax = Number(data?.maxQueries);
      const maxQueries = Number.isFinite(rawMax)
        ? Math.max(1, Math.min(20, Math.floor(rawMax)))
        : 8;
      const project = asString(data?.project, 256) ?? undefined;
      const policy = await readPolicy(kv);
      return {
        success: true,
        expansion: expandFromPolicy(policy, query, project, maxQueries),
      };
    },
  );
}
