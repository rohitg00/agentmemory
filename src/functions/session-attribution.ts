import type { Session, SessionAttribution } from "../types.js";

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function agentRecord(session: Session | null | undefined): Record<string, unknown> {
  const agent = session?.agent;
  return agent && typeof agent === "object" && !Array.isArray(agent)
    ? (agent as Record<string, unknown>)
    : {};
}

export function sessionAgentType(session: Session | null | undefined): string | undefined {
  const agent = agentRecord(session);
  return (
    asNonEmptyString(agent["agentType"]) ||
    asNonEmptyString(agent["role"]) ||
    asNonEmptyString(agent["agent_type"])
  );
}

export function sessionSource(session: Session | null | undefined): string | undefined {
  const agent = agentRecord(session);
  return (
    asNonEmptyString(agent["sessionSource"]) ||
    asNonEmptyString(agent["source"])
  );
}

export function sessionModel(session: Session | null | undefined): string | undefined {
  const agent = agentRecord(session);
  return asNonEmptyString(agent["model"]) || asNonEmptyString(session?.model);
}

export function sessionAttributionLabel(session: Session | null | undefined): string {
  if (!session) return "";
  const agent = agentRecord(session);
  const parts: string[] = [];
  const client = asNonEmptyString(agent["client"]);
  const role = sessionAgentType(session);
  const model = sessionModel(session);
  const source = sessionSource(session);
  if (client) parts.push(role ? `${client}/${role}` : client);
  else if (role) parts.push(role);
  if (model) parts.push(model);
  if (source) parts.push(`source:${source}`);
  if (session.startedAt) parts.push(session.startedAt);
  return parts.join(" | ");
}

export function compactSessionAttribution(
  sessionId: string,
  session: Session | null | undefined,
): SessionAttribution {
  if (!session) return { id: sessionId };
  const model = sessionModel(session);
  const role = sessionAgentType(session);
  const source = sessionSource(session);
  return {
    id: session.id,
    project: session.project,
    startedAt: session.startedAt,
    status: session.status,
    ...(model ? { model } : {}),
    ...(session.agent ? { agent: session.agent } : {}),
    ...(role ? { agentType: role } : {}),
    ...(source ? { sessionSource: source } : {}),
    ...(session.metadata ? { metadata: session.metadata } : {}),
    label: sessionAttributionLabel(session),
  };
}

export function formatSessionHeading(session: Session): string {
  const attribution = sessionAttributionLabel(session);
  return attribution
    ? `Session ${session.id.slice(0, 8)} - ${attribution}`
    : `Session ${session.id.slice(0, 8)} (${session.startedAt})`;
}
