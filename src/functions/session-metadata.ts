import type { AgentIdentity, SessionMetadata } from "../types.js";
import { stripPrivateData } from "./privacy.js";

type SessionMetadataResult = {
  model?: string;
  agent?: AgentIdentity;
  metadata?: SessionMetadata;
  error?: string;
};

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined | null {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function redactRecord(record: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(stripPrivateData(JSON.stringify(record))) as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

export function normalizeSessionMetadata(
  body: Record<string, unknown>,
): SessionMetadataResult {
  const model = asNonEmptyString(body["model"]);

  const rawMetadata = asRecord(body["metadata"]);
  if (rawMetadata === null) {
    return { error: "metadata must be an object when provided" };
  }

  const rawAgent = asRecord(body["agent"]);
  if (rawAgent === null) {
    return { error: "agent must be an object when provided" };
  }

  let agent: AgentIdentity | undefined;

  if (rawAgent) {
    const client = asNonEmptyString(rawAgent["client"]);
    if (!client) {
      return { error: "agent.client must be a non-empty string" };
    }

    const agentModel = asNonEmptyString(rawAgent["model"]) || model;
    const agentType =
      asNonEmptyString(rawAgent["agentType"]) ||
      asNonEmptyString(rawAgent["role"]) ||
      asNonEmptyString(rawAgent["agent_type"]);
    const sessionSource =
      asNonEmptyString(rawAgent["sessionSource"]) ||
      asNonEmptyString(rawAgent["source"]);

    agent = {
      client,
      ...(agentModel ? { model: agentModel } : {}),
      ...(agentType ? { agentType } : {}),
      ...(sessionSource ? { sessionSource } : {}),
    };
  } else {
    const client = asNonEmptyString(body["agentClient"]);
    const agentType =
      asNonEmptyString(body["agentType"]) ||
      asNonEmptyString(body["role"]) ||
      asNonEmptyString(body["agent_type"]);
    const sessionSource =
      asNonEmptyString(body["sessionSource"]) ||
      asNonEmptyString(body["source"]);

    if (client || agentType || sessionSource) {
      agent = {
        client: client || "unknown",
        ...(model ? { model } : {}),
        ...(agentType ? { agentType } : {}),
        ...(sessionSource ? { sessionSource } : {}),
      };
    }
  }

  return {
    ...(model ? { model } : {}),
    ...(agent ? { agent } : {}),
    ...(rawMetadata ? { metadata: redactRecord(rawMetadata) } : {}),
  };
}
