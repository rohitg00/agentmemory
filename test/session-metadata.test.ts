import { describe, expect, it } from "vitest";
import { normalizeSessionMetadata } from "../src/functions/session-metadata.js";

describe("normalizeSessionMetadata", () => {
  it("normalizes explicit agent identity and session metadata", () => {
    const result = normalizeSessionMetadata({
      model: "claude-sonnet-4-6",
      agent: {
        client: "claude-code",
        agentType: "planner",
        sessionSource: "startup",
      },
      metadata: {
        taskType: "refactor",
        agentVersion: "2.1.0",
      },
    });

    expect(result).toEqual({
      model: "claude-sonnet-4-6",
      agent: {
        client: "claude-code",
        model: "claude-sonnet-4-6",
        agentType: "planner",
        sessionSource: "startup",
      },
      metadata: {
        taskType: "refactor",
        agentVersion: "2.1.0",
      },
    });
  });

  it("supports top-level agent convenience fields", () => {
    const result = normalizeSessionMetadata({
      model: "qwen3-coder",
      agentClient: "opencode",
      agentType: "worker",
      sessionSource: "resume",
    });

    expect(result).toEqual({
      model: "qwen3-coder",
      agent: {
        client: "opencode",
        model: "qwen3-coder",
        agentType: "worker",
        sessionSource: "resume",
      },
    });
  });

  it("normalizes common agent role and source aliases", () => {
    const explicit = normalizeSessionMetadata({
      agent: {
        client: "codex",
        role: "worker",
        source: "handoff-resume",
      },
    });
    const topLevel = normalizeSessionMetadata({
      agentClient: "opencode",
      agent_type: "local-inference",
      source: "manual",
    });

    expect(explicit.agent).toEqual({
      client: "codex",
      agentType: "worker",
      sessionSource: "handoff-resume",
    });
    expect(topLevel.agent).toEqual({
      client: "opencode",
      agentType: "local-inference",
      sessionSource: "manual",
    });
  });

  it("rejects malformed metadata and agent payloads", () => {
    expect(normalizeSessionMetadata({ metadata: "bad" })).toEqual({
      error: "metadata must be an object when provided",
    });
    expect(normalizeSessionMetadata({ metadata: null })).toEqual({
      error: "metadata must be an object when provided",
    });
    expect(normalizeSessionMetadata({ agent: [] })).toEqual({
      error: "agent must be an object when provided",
    });
    expect(normalizeSessionMetadata({ agent: null })).toEqual({
      error: "agent must be an object when provided",
    });
    expect(normalizeSessionMetadata({ agent: { model: "missing-client" } })).toEqual({
      error: "agent.client must be a non-empty string",
    });
  });

  it("redacts secrets from custom metadata", () => {
    const result = normalizeSessionMetadata({
      metadata: {
        note: "safe",
        token: "Bearer abcdefghijklmnopqrstuvwxyz1234567890",
      },
    });

    expect(result.metadata).toEqual({
      note: "safe",
      token: "[REDACTED_SECRET]",
    });
  });
});
