import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubIssueWatcher } from "../integrations/github-watcher/watcher.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";
import type { SearchResult, Session } from "../src/types.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const repository = { id: 123, full_name: "owner/repo", private: false };
const original = {
  id: 456, number: 7, title: "Choose stable project identity",
  body: "Keep review decisions with the checkout's project.", state: "open",
  updated_at: "2026-11-10T12:00:00Z", html_url: "https://github.com/owner/repo/issues/7",
};
type Capture = { eventId: string; sessionId: string; project: string };

async function receiver(kv = mockKV()) {
  const { registerObserveFunction } = await import("../src/functions/observe.js");
  const { registerCaptureFunctions } = await import("../src/functions/capture.js");
  const { registerApiTriggers } = await import("../src/triggers/api.js");
  const { registerSearchFunction, setIndexPersistence, getSearchIndex, rebuildKeywordIndex } = await import("../src/functions/search.js");
  const { KV } = await import("../src/state/schema.js");
  const sdk = mockSdk({ looseTrigger: true });
  setIndexPersistence(null);
  getSearchIndex().clear();
  registerObserveFunction(sdk as never, kv as never);
  registerCaptureFunctions(sdk as never, kv as never);
  registerApiTriggers(sdk as never, kv as never);
  registerSearchFunction(sdk as never, kv as never);
  await rebuildKeywordIndex(kv as never);
  const sent: Capture[] = [];
  const accepted = new Map<string, string[]>();
  let issue = original;
  const transport: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === "http://127.0.0.1:3111/agentmemory/observe") {
      const snapshot = JSON.parse(String(init?.body)) as Capture;
      sent.push(snapshot);
      const result = await sdk.trigger({ function_id: "api::observe", payload: { body: snapshot } }) as
        { status_code: number; body: { status: string; observationId: string } };
      if (result.body.status === "accepted") {
        accepted.set(snapshot.project, [...(accepted.get(snapshot.project) ?? []), result.body.observationId]);
      }
      return Response.json(result.body, { status: result.status_code });
    }
    if (url === "https://api.github.com/repos/owner/repo") return Response.json(repository);
    if (url.startsWith("https://api.github.com/repos/owner/repo/issues?")) return Response.json([issue]);
    throw new Error("Unexpected fixture destination; real network denied");
  };
  const watcher = (project: string) => new GitHubIssueWatcher({
    repo: "owner/repo", project, cwd: `/work/${project}`, baseUrl: "http://127.0.0.1:3111", fetch: transport,
  });
  const search = async (project: string) => {
    const result = await sdk.trigger({ function_id: "mem::search", payload: {
      query: "project identity", project, targetLayer: "observation",
    } }) as { results: SearchResult[] };
    return result.results.map((row) => row.observation.id).sort();
  };
  const captureLegacy = () => sdk.trigger({ function_id: "api::observe", payload: { body: {
    eventId: "gh_de4f949794228efe9acaffea7949d7511e455735dfe9ee361c0025297bb0e68c",
    hookType: "post_tool_use", sessionId: "gh_123_issue_456", project: "alpha", cwd: "/work/alpha",
    timestamp: original.updated_at, data: { tool_name: "GitHubIssue", tool_output: "Choose stable project identity" },
  } } });
  return { kv, sent, accepted, watcher, search, captureLegacy, KV, sessions: () => kv.list<Session>(KV.sessions),
    edit: () => { issue = { ...original, title: "Changed project identity", updated_at: "2026-11-11T12:00:00Z" }; } };
}

describe("GitHub issue project visibility through the real receiver", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it.each(["alpha", "beta"])("keeps both project searches isolated when %s captures first", async (first) => {
    const second = first === "alpha" ? "beta" : "alpha";
    const h = await receiver();
    expect(await h.watcher(first).syncOnce()).toMatchObject({ completed: 1, duplicates: 0 });
    expect(await h.watcher(second).syncOnce()).toMatchObject({ completed: 1, duplicates: 0 });
    expect(h.accepted.get(first)).toHaveLength(1);
    expect(h.accepted.get(second)).toHaveLength(1);
    expect(await h.search(second)).toEqual(h.accepted.get(second));
    expect(await h.search(first)).toEqual(h.accepted.get(first));
    expect((await h.sessions()).map((session) => session.project).sort()).toEqual(["alpha", "beta"]);
    expect(h.sent[0]!.sessionId).not.toBe(h.sent[1]!.sessionId);
    expect(h.sent[0]!.eventId).toBe(h.sent[1]!.eventId);
    expect(await h.watcher(second).syncOnce()).toMatchObject({ completed: 0, duplicates: 1 });
    h.edit();
    expect(await h.watcher(second).syncOnce()).toMatchObject({ completed: 1, duplicates: 0 });
    expect(h.sent[1]!.sessionId).toBe(h.sent[3]!.sessionId);
    expect(await h.search(first)).toEqual(h.accepted.get(first));
    expect(await h.search(second)).toEqual(h.accepted.get(second)!.sort());
    vi.resetModules();
    const restarted = await receiver(h.kv);
    expect(await restarted.watcher(second).syncOnce()).toMatchObject({ completed: 0, duplicates: 1 });
    expect(await restarted.search(first)).toEqual(h.accepted.get(first));
    expect(await restarted.search(second)).toEqual(h.accepted.get(second)!.sort());
    expect((await restarted.sessions()).map((session) => session.project).sort()).toEqual(["alpha", "beta"]);
  });

  it("retains the published full-length revision ID and real repeat deduplication", async () => {
    const h = await receiver();
    expect(await h.watcher("alpha").syncOnce()).toMatchObject({ completed: 1 });
    expect(await h.watcher("alpha").syncOnce()).toMatchObject({ completed: 0, duplicates: 1 });
    expect(h.sent.map((snapshot) => snapshot.eventId)).toEqual(Array(2).fill(
      "gh_de4f949794228efe9acaffea7949d7511e455735dfe9ee361c0025297bb0e68c"));
    expect(h.accepted.get("alpha")).toHaveLength(1);
    expect(await h.search("alpha")).toEqual(h.accepted.get("alpha"));
  });

  it("preserves legacy captured records and makes the new project-scoped namespace explicit", async () => {
    const h = await receiver();
    expect(await h.captureLegacy()).toMatchObject({ status_code: 201, body: { state: "completed" } });
    const oldSession = JSON.stringify(await h.kv.get(h.KV.sessions, "gh_123_issue_456"));
    const oldObservations = JSON.stringify(await h.kv.list(h.KV.observations("gh_123_issue_456")));
    expect(await h.watcher("alpha").syncOnce()).toMatchObject({ completed: 1, duplicates: 0 });
    expect(h.sent[0]!.sessionId).not.toBe("gh_123_issue_456");
    expect(h.sent[0]!.eventId).toBe("gh_de4f949794228efe9acaffea7949d7511e455735dfe9ee361c0025297bb0e68c");
    expect(JSON.stringify(await h.kv.get(h.KV.sessions, "gh_123_issue_456"))).toBe(oldSession);
    expect(JSON.stringify(await h.kv.list(h.KV.observations("gh_123_issue_456")))).toBe(oldObservations);
    expect(await h.watcher("alpha").syncOnce()).toMatchObject({ completed: 0, duplicates: 1 });
    expect(await h.kv.list(h.KV.observations(h.sent[0]!.sessionId))).toHaveLength(1);
  });
});
