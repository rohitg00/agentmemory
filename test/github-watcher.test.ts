import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { GitHubIssueWatcher, GitHubSyncError } from "../integrations/github-watcher/watcher.mjs";
import { mockKV, mockSdk } from "./helpers/mocks.js";

vi.mock("../src/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const repo = { id: 123, full_name: "owner/repo", private: false };
const first = {
  id: 456, number: 7, title: "Choose stable project identity",
  body: "Keep review decisions with the checkout's project.", state: "open",
  updated_at: "2026-11-10T12:00:00Z", html_url: "https://github.com/owner/repo/issues/7",
};
const second = { ...first, id: 457, number: 8, title: "Another issue", html_url: "https://github.com/owner/repo/issues/8" };
const firstId = "gh_de4f949794228efe9acaffea7949d7511e455735dfe9ee361c0025297bb0e68c";
const next = "https://api.github.com/repositories/123/issues?state=all&sort=updated&direction=asc&per_page=100&page=2";
const target = "http://127.0.0.1:3111/agentmemory/observe";
const options = { repo: "owner/repo", project: "example-project", cwd: "/work/example-project", baseUrl: "http://127.0.0.1:3111" };
type Snapshot = { eventId: string; sessionId: string; project: string; data: { tool_output: string } };
type Read = (url: string, init: RequestInit) => Response | Promise<Response>;
type Capture = (snapshot: Snapshot) => Response | Promise<Response>;

function harness(read?: Read, capture?: Capture) {
  const sent: Snapshot[] = [];
  const retained = new Set<string>();
  const transport = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (url === target) {
      const snapshot = JSON.parse(String(init.body)) as Snapshot;
      sent.push(snapshot);
      if (capture) return capture(snapshot);
      const key = `${snapshot.project}:${snapshot.sessionId}:${snapshot.eventId}`;
      const duplicate = retained.has(key);
      retained.add(key);
      return Response.json({ status: duplicate ? "duplicate" : "accepted", state: "completed",
        eventId: snapshot.eventId, observationId: `obs_${snapshot.eventId}` }, { status: duplicate ? 200 : 201 });
    }
    if (!url.startsWith("https://api.github.com/")) throw new Error("Unexpected test transport destination");
    if (read) return read(url, init);
    return Response.json(url.endsWith("/repos/owner/repo") ? repo : [first]);
  });
  return { sent, transport, retained, watcher: new GitHubIssueWatcher({ ...options, fetch: transport }) };
}

async function receiver(kv = mockKV()) {
  const { registerObserveFunction } = await import("../src/functions/observe.js");
  const { registerCaptureFunctions } = await import("../src/functions/capture.js");
  const { registerApiTriggers } = await import("../src/triggers/api.js");
  const { KV } = await import("../src/state/schema.js");
  const sdk = mockSdk({ looseTrigger: true });
  registerObserveFunction(sdk as never, kv as never);
  registerCaptureFunctions(sdk as never, kv as never);
  registerApiTriggers(sdk as never, kv as never);
  const capture: Capture = async (snapshot) => {
    const result = await sdk.trigger({ function_id: "api::observe", payload: { body: snapshot } }) as
      { status_code: number; body: Record<string, unknown> };
    return Response.json(result.body, { status: result.status_code });
  };
  return { kv, capture, observations: () => [...(kv.store.get(KV.observations("gh_123_issue_456"))?.values() ?? [])] };
}

describe("GitHub issue connector spike", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("sends the entire independently frozen valid observe payload with separate credentials", async () => {
    const h = harness();
    const watcher = new GitHubIssueWatcher({ ...options, fetch: h.transport, githubToken: "github-only-token", secret: "store-only-secret" });
    expect(await watcher.syncOnce()).toEqual({ complete: true, pages: 1, issues: 1, completed: 1, duplicates: 0, notModifiedPages: 0 });
    expect(h.sent).toEqual([{
      eventId: firstId, hookType: "post_tool_use", sessionId: "gh_123_issue_456",
      project: "example-project", cwd: "/work/example-project", timestamp: first.updated_at,
      data: { source: "github-watcher", tool_name: "GitHubIssue",
        tool_input: { repository: "owner/repo", issue: 7, url: first.html_url },
        tool_output: "#7 Choose stable project identity\nState: open\nhttps://github.com/owner/repo/issues/7\n\nKeep review decisions with the checkout's project." },
    }]);
    for (const [url, init] of h.transport.mock.calls) {
      expect(init?.redirect).toBe("error");
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe(String(url).endsWith("/repos/owner/repo") ? "Bearer github-only-token" :
        String(url).startsWith("https://api.github.com/") ? null : "Bearer store-only-secret");
    }
    expect(JSON.stringify(h.sent)).not.toContain("token");
    expect(JSON.stringify(h.sent)).not.toContain("secret");
  });

  it("uses the actual receiver for one capture, immediate repeat, restarted client/server and one edited revision", async () => {
    let actual = await receiver();
    let edited = false;
    const h = harness((url) => Response.json(url.endsWith("/repos/owner/repo") ? repo :
      [{ ...first, ...(edited ? { title: "Changed design decision", updated_at: "2026-11-11T12:00:00Z" } : {}) }]),
    (snapshot) => actual.capture(snapshot));
    expect((await h.watcher.syncOnce()).completed).toBe(1);
    expect(await h.watcher.syncOnce()).toMatchObject({ completed: 0, duplicates: 1 });
    expect(actual.observations()).toHaveLength(1);
    vi.resetModules();
    actual = await receiver(actual.kv);
    const restarted = new GitHubIssueWatcher({ ...options, fetch: h.transport });
    expect(await restarted.syncOnce()).toMatchObject({ completed: 0, duplicates: 1 });
    edited = true;
    expect(await restarted.syncOnce()).toMatchObject({ completed: 1, duplicates: 0 });
    expect(actual.observations()).toHaveLength(2);
    expect(h.sent.map((s) => s.sessionId)).toEqual(Array(4).fill("gh_123_issue_456"));
    expect(h.sent[0]!.eventId).toBe(h.sent[2]!.eventId);
    expect(h.sent[2]!.eventId).not.toBe(h.sent[3]!.eventId);
  });

  it("keeps IDs bounded for long repository names and stable across repository casing and rename", async () => {
    const name = `Owner/${"x".repeat(100)}`;
    const ids: string[] = [];
    for (const full_name of [name, name.toLowerCase(), "new-owner/new-name"]) {
      const h = harness((url) => Response.json(url.endsWith(`/repos/${full_name}`) ? { ...repo, full_name } :
        [{ ...first, html_url: `https://github.com/${full_name}/issues/7` }]));
      await new GitHubIssueWatcher({ ...options, repo: full_name, fetch: h.transport }).syncOnce();
      ids.push(h.sent[0]!.eventId);
    }
    expect(ids).toEqual([firstId, firstId, firstId]);
    expect(firstId).toMatch(/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/);
  });

  it("distinguishes same-second edits including NUL characters across title/body field boundaries", async () => {
    let changed = false;
    const h = harness((url) => Response.json(url.endsWith("/repos/owner/repo") ? repo :
      [{ ...first, title: changed ? "decision" : "decision\0boundary", body: changed ? "boundary\0text" : "text" }]));
    await h.watcher.syncOnce(); changed = true; await h.watcher.syncOnce();
    expect(h.sent[0]!.eventId).not.toBe(h.sent[1]!.eventId);
    expect(h.sent[0]!.data.tool_output).not.toBe(h.sent[1]!.data.tool_output);
  });

  it("refuses a private repository before issue retrieval and observe", async () => {
    const h = harness(() => Response.json({ ...repo, private: true }));
    await expect(h.watcher.syncOnce()).rejects.toThrow("public repositories only");
    expect(h.transport).toHaveBeenCalledTimes(1);
    expect(h.sent).toEqual([]);
  });

  it("cannot use a configured token to read private issue content after a visibility change", async () => {
    const h = harness((url, init) => {
      if (url.endsWith("/repos/owner/repo")) return Response.json(repo);
      return new Headers(init.headers).has("authorization") ?
        Response.json([{ ...first, body: "private content after the metadata read" }]) : new Response(null, { status: 404 });
    });
    const watcher = new GitHubIssueWatcher({ ...options, fetch: h.transport, githubToken: "private-capable-token" });
    await expect(watcher.syncOnce()).rejects.toThrow("HTTP 404");
    expect(h.transport).toHaveBeenCalledTimes(2);
    expect(h.sent).toEqual([]);
    expect(new Headers(h.transport.mock.calls[1]![1]?.headers).has("authorization")).toBe(false);
  });

  it("follows numeric-repository Link pages and excludes PR rows", async () => {
    const h = harness((url) => {
      if (url.endsWith("/repos/owner/repo")) return Response.json(repo);
      if (url === next) return Response.json([second]);
      return Response.json([first, { id: 999, pull_request: { url: "https://api.github.com/pulls/9" } }], { headers: { link: `<${next}>; rel="next"` } });
    });
    expect(await h.watcher.syncOnce()).toEqual({ complete: true, pages: 2, issues: 2, completed: 2, duplicates: 0, notModifiedPages: 0 });
    expect(h.sent.map((s) => s.sessionId)).toEqual(["gh_123_issue_456", "gh_123_issue_457"]);
  });

  it("visits page2 after page1 304 and observes its edit without refreshing failed cache state", async () => {
    let phase = 0;
    const h = harness((url, init) => {
      if (url.endsWith("/repos/owner/repo")) return Response.json(repo);
      const tag = new Headers(init.headers).get("if-none-match");
      if (url === next) {
        if (phase === 1 && tag === '"p2"') return new Response(null, { status: 304 });
        return Response.json([{ ...second, ...(phase === 2 ? { body: "Changed on page2" } : {}) }], { headers: { etag: phase === 2 ? '"p2-new"' : '"p2"' } });
      }
      if (tag === '"p1"') return new Response(null, { status: 304 });
      return Response.json([first], { headers: { etag: '"p1"', link: `<${next}>; rel="next"` } });
    });
    expect(await h.watcher.syncOnce()).toEqual({ complete: true, pages: 2, issues: 2, completed: 2, duplicates: 0, notModifiedPages: 0 });
    phase = 1;
    expect(await h.watcher.syncOnce()).toEqual({ complete: true, pages: 2, issues: 2, completed: 0, duplicates: 2, notModifiedPages: 2 });
    phase = 2;
    expect(await h.watcher.syncOnce()).toEqual({ complete: true, pages: 2, issues: 2, completed: 1, duplicates: 1, notModifiedPages: 1 });
  });

  it("retains confirmed earlier captures on a later-page error and sends no new ETag on retry", async () => {
    let fail = true;
    const pageHeaders: Array<string | null> = [];
    const h = harness((url, init) => {
      if (url.endsWith("/repos/owner/repo")) return Response.json(repo);
      pageHeaders.push(new Headers(init.headers).get("if-none-match"));
      if (url === next) return fail ? new Response(null, { status: 503 }) : Response.json([second]);
      return Response.json([first], { headers: { etag: '"do-not-commit"', link: `<${next}>; rel="next"` } });
    });
    await expect(h.watcher.syncOnce()).rejects.toMatchObject({ progress: { pages: 1, completed: 1, duplicates: 0 } });
    fail = false;
    expect(await h.watcher.syncOnce()).toMatchObject({ complete: true, completed: 1, duplicates: 1 });
    expect(pageHeaders).toEqual([null, null, null, null]);
  });

  it.each(["pending", "retrying", "dead"])("does not accept HTTP200 duplicate/%s as completion", async (state) => {
    const h = harness(undefined, (snapshot) => Response.json({ status: "duplicate", state, eventId: snapshot.eventId }));
    await expect(h.watcher.syncOnce()).rejects.toMatchObject({ progress: { completed: 0, duplicates: 0 }, details: { failedEventId: firstId } });
    expect(h.sent).toHaveLength(1);
  });

  it("does not advance a page cache after accepted/retrying202, then recovers on explicit rerun", async () => {
    let retrying = true;
    const tags: Array<string | null> = [];
    const h = harness((url, init) => {
      if (url.endsWith("/repos/owner/repo")) return Response.json(repo);
      tags.push(new Headers(init.headers).get("if-none-match"));
      return Response.json([first], { headers: { etag: '"unfinished"' } });
    }, (snapshot) => Response.json({ status: "accepted", state: retrying ? "retrying" : "completed", eventId: snapshot.eventId }, { status: retrying ? 202 : 201 }));
    await expect(h.watcher.syncOnce()).rejects.toBeInstanceOf(GitHubSyncError);
    retrying = false;
    expect((await h.watcher.syncOnce()).completed).toBe(1);
    expect(tags).toEqual([null, null]);
  });

  it.each([{}, { status: "accepted", state: "completed", eventId: "wrong-event" }, { success: true }])("rejects malformed or mismatched acknowledgments %#", async (ack) => {
    const h = harness(undefined, () => Response.json(ack));
    await expect(h.watcher.syncOnce()).rejects.toMatchObject({ progress: { completed: 0, duplicates: 0 } });
    expect(h.sent).toHaveLength(1);
  });

  it("reports an unknown capture outcome without automatically resending or leaking an exception token", async () => {
    const h = harness(undefined, () => { throw new Error("github-only-token store-only-secret"); });
    const error = await h.watcher.syncOnce().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubSyncError);
    expect(String(error)).toContain("outcome unknown");
    expect(String(error)).not.toMatch(/github-only-token|store-only-secret/);
    expect(h.sent).toHaveLength(1);
  });

  it("reports a rejected second capture while retaining the first completed item", async () => {
    const h = harness((url) => Response.json(url.endsWith("/repos/owner/repo") ? repo : [first, second]),
      (snapshot) => snapshot.sessionId.endsWith("_456") ?
        Response.json({ status: "accepted", state: "completed", eventId: snapshot.eventId }, { status: 201 }) :
        Response.json({ status: "rejected", eventId: snapshot.eventId, error: "inbox full", retryable: true }, { status: 503 }));
    await expect(h.watcher.syncOnce()).rejects.toMatchObject({ progress: { pages: 1, issues: 2, completed: 1, duplicates: 0 } });
    expect(h.sent).toHaveLength(2);
  });

  it("refuses a conditional response without a previously completed cached page", async () => {
    const h = harness((url) => url.endsWith("/repos/owner/repo") ? Response.json(repo) : new Response(null, { status: 304 }));
    await expect(h.watcher.syncOnce()).rejects.toThrow("304 without a completed cached page");
    expect(h.sent).toEqual([]);
  });

  it("rejects a repeated next URL without spinning or discarding confirmed items", async () => {
    const h = harness((url) => url.endsWith("/repos/owner/repo") ? Response.json(repo) :
      Response.json(url === next ? [second] : [first], { headers: { link: `<${next}>; rel="next"` } }));
    await expect(h.watcher.syncOnce()).rejects.toMatchObject({ message: "GitHub returned a pagination cycle", progress: { pages: 2, completed: 2 } });
    expect(h.sent).toHaveLength(2);
  });

  it("rejects a concurrent sync while allowing the original pending action to complete", async () => {
    let release: (value: Response) => void = () => { throw new Error("not initialized"); };
    const waiting = new Promise<Response>((resolve) => { release = resolve; });
    const h = harness((url) => url.endsWith("/repos/owner/repo") ? waiting : Response.json([first]));
    const healthy = h.watcher.syncOnce();
    await expect(h.watcher.syncOnce()).rejects.toThrow("already running");
    expect(h.transport).toHaveBeenCalledTimes(1);
    release(Response.json(repo));
    expect(await healthy).toMatchObject({ complete: true, completed: 1 });
  });

  it.each([403, 429])("stops at rate-limit HTTP%s without another request", async (status) => {
    const h = harness(() => new Response("private error body", { status, headers: { "retry-after": "60" } }));
    await expect(h.watcher.syncOnce()).rejects.toThrow(`HTTP ${status}`);
    expect(h.transport).toHaveBeenCalledTimes(1);
    expect(h.sent).toEqual([]);
  });

  it("fails at the explicit page bound with honest earlier counts", async () => {
    const h = harness((url) => url.endsWith("/repos/owner/repo") ? Response.json(repo) :
      Response.json([first], { headers: { link: `<${next}>; rel="next"` } }));
    const watcher = new GitHubIssueWatcher({ ...options, fetch: h.transport, maxPages: 1 });
    await expect(watcher.syncOnce()).rejects.toMatchObject({ progress: { pages: 1, completed: 1 } });
    expect(h.transport).toHaveBeenCalledTimes(3);
  });

  it.each(["https://evil.example/issues?page=2", "https://api.github.com/repos/other/repo/issues?page=2", next.replace("state=all", "state=open")])("refuses an unsafe or query-changing Link %# before any capture", async (link) => {
    const h = harness((url) => url.endsWith("/repos/owner/repo") ? Response.json(repo) :
      Response.json([first], { headers: { link: `<${link}>; rel="next"` } }));
    await expect(h.watcher.syncOnce()).rejects.toThrow(/next page/);
    expect(h.sent).toEqual([]);
    expect(h.transport).toHaveBeenCalledTimes(2);
  });

  it("does not expose read/JSON exceptions or the source error body", async () => {
    const h = harness(async () => { const response = Response.json(repo); response.json = async () => { throw new Error("github-only-token"); }; return response; });
    const error = await h.watcher.syncOnce().catch((e: unknown) => e);
    expect(String(error)).toContain("invalid JSON");
    expect(String(error)).not.toContain("github-only-token");
    expect(h.sent).toEqual([]);
  });

  it("validates project, repository, destination and bounds before any transport call", () => {
    const h = harness();
    for (const invalid of [{ project: " " }, { repo: "owner/.." }, { baseUrl: "https://user:password@example.com" }, { maxPages: 0 }, { since: "yesterday" }]) {
      expect(() => new GitHubIssueWatcher({ ...options, fetch: h.transport, ...invalid })).toThrow();
    }
    expect(h.transport).not.toHaveBeenCalled();
  });

  it("carries an explicitly selected since query without inventing a persisted cursor", async () => {
    const h = harness();
    await new GitHubIssueWatcher({ ...options, fetch: h.transport, since: "2026-11-01T00:00:00Z" }).syncOnce();
    const requested = new URL(String(h.transport.mock.calls[1]![0]));
    expect(Object.fromEntries(requested.searchParams)).toEqual({ state: "all", sort: "updated", direction: "asc", per_page: "100", since: "2026-11-01T00:00:00Z" });
  });

  it("prints one-shot scope in the real Node CLI help without a GitHub or service request", () => {
    const output = execFileSync(process.execPath, ["integrations/github-watcher/bin.mjs", "--help"], { encoding: "utf8" });
    expect(output).toContain("--repo owner/repo --project hook-project");
    expect(output).toContain("No daemon, private sync, durable cursor or package release");
  });
});
