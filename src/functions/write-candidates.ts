import type { ISdk } from "iii-sdk";
import type { MemoryWriteCandidate } from "../types.js";
import { KV, generateId } from "../state/schema.js";
import type { StateKV } from "../state/kv.js";
import { recordAudit } from "./audit.js";

const SECRET_PATTERN =
  /(sk-[A-Za-z0-9_-]{6,}|github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9_]+|xox[baprs]-[A-Za-z0-9-]+|AKIA[0-9A-Z]{16}|api[_ -]?key\s*(?:是|=|:)\s*\S+|token\s*(?:是|=|:)\s*\S+)/gi;

function nowIso(): string {
  return new Date().toISOString();
}

function asString(value: unknown, max = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function redactSecrets(text: string): string {
  return text.replace(SECRET_PATTERN, "[REDACTED_SECRET]");
}

function isLowSignal(text: string): boolean {
  return /^(哈哈|嗯|好的|可以|ok|行|好|继续)+$/i.test(text.trim());
}

function resolveScope(data: {
  agentId?: string;
  project?: string;
}): MemoryWriteCandidate["scope"] {
  if (data.agentId) return "agent";
  if (data.project) return "project";
  return "global";
}

function makeReadbackQueries(candidate: {
  subject: string;
  predicate: string;
  value: string;
  memoryType: string;
}): string[] {
  const candidates = [
    `${candidate.subject} ${candidate.predicate}`,
    `${candidate.subject} ${candidate.value.slice(0, 48)}`,
    `${candidate.memoryType} ${candidate.value.slice(0, 48)}`,
  ];
  const seen = new Set<string>();
  return candidates
    .map((q) => q.replace(/\s+/g, " ").trim())
    .filter((q) => {
      if (!q || seen.has(q)) return false;
      seen.add(q);
      return true;
    })
    .slice(0, 5);
}

function baseCandidate(data: {
  sourceText: string;
  sessionId?: string;
  observationId?: string;
  project?: string;
  agentId?: string;
}): Omit<
  MemoryWriteCandidate,
  | "id"
  | "createdAt"
  | "subject"
  | "predicate"
  | "value"
  | "memoryType"
  | "confidence"
  | "importance"
  | "target"
  | "requiresReview"
  | "reason"
  | "readbackQueries"
  | "status"
> {
  const sourceText = redactSecrets(data.sourceText).slice(0, 1200);
  return {
    ...(data.sessionId ? { sessionId: data.sessionId } : {}),
    ...(data.observationId ? { observationId: data.observationId } : {}),
    ...(data.project ? { project: data.project } : {}),
    ...(data.agentId ? { agentId: data.agentId } : {}),
    scope: resolveScope(data),
    sourceText,
    evidenceQuote: sourceText.slice(0, 500),
  };
}

function completeCandidate(
  base: ReturnType<typeof baseCandidate>,
  fields: Pick<
    MemoryWriteCandidate,
    | "subject"
    | "predicate"
    | "value"
    | "memoryType"
    | "confidence"
    | "importance"
    | "target"
    | "requiresReview"
    | "reason"
  >,
): MemoryWriteCandidate {
  const candidate: MemoryWriteCandidate = {
    id: generateId("cand"),
    createdAt: nowIso(),
    ...base,
    ...fields,
    value: redactSecrets(fields.value).slice(0, 500),
    status: "shadow",
    readbackQueries: [],
  };
  candidate.readbackQueries = makeReadbackQueries(candidate);
  return candidate;
}

function extractCandidates(data: {
  sourceText: string;
  sessionId?: string;
  observationId?: string;
  project?: string;
  agentId?: string;
}): MemoryWriteCandidate[] {
  const text = data.sourceText.trim();
  if (!text || isLowSignal(text)) return [];
  const base = baseCandidate(data);

  if (/(api[_ -]?key|token|凭据|credential|not logged in|登录)/i.test(text)) {
    return [
      completeCandidate(base, {
        subject: "tool_credential_route",
        predicate: "derived_from_user_signal",
        value: base.evidenceQuote,
        memoryType: "credential_route",
        confidence: 0.86,
        importance: 0.9,
        target: "review",
        requiresReview: true,
        reason: "Credential-related memory must be reviewed and redacted",
      }),
    ];
  }

  if (/(以后|下次|遇到|先|必须|一定要|不要|别).{0,80}(报错|错误|修复|检查|验证|记录|动手|执行)/i.test(text)) {
    return [
      completeCandidate(base, {
        subject: "agent_memory_workflow",
        predicate: "procedural_rule",
        value: base.evidenceQuote,
        memoryType: "procedural_rule",
        confidence: 0.88,
        importance: 0.9,
        target: "review",
        requiresReview: true,
        reason: "Future workflow instruction should be reviewed before durable write",
      }),
    ];
  }

  if (/(我|用户).{0,20}(更喜欢|喜欢|偏好|讨厌|不喜欢|关心|在意)/.test(text)) {
    return [
      completeCandidate(base, {
        subject: "user",
        predicate: "preference",
        value: base.evidenceQuote,
        memoryType: "preference",
        confidence: 0.82,
        importance: 0.8,
        target: "memory",
        requiresReview: false,
        reason: "Explicit user preference",
      }),
    ];
  }

  return [];
}

function validStatus(value: unknown): value is MemoryWriteCandidate["status"] {
  return (
    value === "shadow" ||
    value === "approved" ||
    value === "rejected" ||
    value === "written" ||
    value === "readback_failed"
  );
}

export function registerWriteCandidatesFunction(sdk: ISdk, kv: StateKV): void {
  sdk.registerFunction(
    "mem::write-candidates-generate",
    async (data: {
      sourceText?: string;
      sessionId?: string;
      observationId?: string;
      project?: string;
      agentId?: string;
    }) => {
      const sourceText = asString(data?.sourceText, 5000);
      if (!sourceText) return { success: false, error: "sourceText is required" };
      const payload = {
        sourceText,
        sessionId: asString(data.sessionId, 128),
        observationId: asString(data.observationId, 128),
        project: asString(data.project, 256),
        agentId: asString(data.agentId, 128),
      };
      const candidates = extractCandidates(payload);
      await Promise.all(
        candidates.map((candidate) =>
          kv.set(KV.writeCandidates, candidate.id, candidate),
        ),
      );
      if (candidates.length > 0) {
        await recordAudit(
          kv,
          "write_candidate",
          "mem::write-candidates-generate",
          candidates.map((candidate) => candidate.id),
          { generated: candidates.length },
        );
      }
      return { success: true, candidates };
    },
  );

  sdk.registerFunction(
    "mem::write-candidates-list",
    async (data?: {
      status?: MemoryWriteCandidate["status"];
      project?: string;
      agentId?: string;
      limit?: number;
    }) => {
      const requestedLimit = data?.limit;
      const limit = Number.isFinite(requestedLimit)
        ? Math.max(1, Math.min(200, Math.floor(requestedLimit as number)))
        : 50;
      let candidates = await kv.list<MemoryWriteCandidate>(KV.writeCandidates);
      if (validStatus(data?.status)) {
        candidates = candidates.filter((candidate) => candidate.status === data.status);
      }
      const project = asString(data?.project, 256);
      if (project) candidates = candidates.filter((candidate) => candidate.project === project);
      const agentId = asString(data?.agentId, 128);
      if (agentId) candidates = candidates.filter((candidate) => candidate.agentId === agentId);
      candidates.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      return { success: true, candidates: candidates.slice(0, limit) };
    },
  );

  sdk.registerFunction(
    "mem::write-candidates-review",
    async (data: { candidateId?: string; decision?: string; reason?: string }) => {
      const candidateId = asString(data?.candidateId, 128);
      if (!candidateId) return { success: false, error: "candidateId is required" };
      if (data.decision !== "approve" && data.decision !== "reject") {
        return { success: false, error: "decision must be approve or reject" };
      }
      const candidate = await kv.get<MemoryWriteCandidate>(
        KV.writeCandidates,
        candidateId,
      );
      if (!candidate) return { success: false, error: "candidate not found" };
      const reviewed: MemoryWriteCandidate = {
        ...candidate,
        status: data.decision === "approve" ? "approved" : "rejected",
      };
      await kv.set(KV.writeCandidates, reviewed.id, reviewed);
      await recordAudit(
        kv,
        "write_candidate",
        "mem::write-candidates-review",
        [reviewed.id],
        {
          decision: data.decision,
          reason: asString(data.reason, 500),
        },
      );
      return { success: true, candidate: reviewed };
    },
  );
}
