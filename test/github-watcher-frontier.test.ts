import { describe, expect, it } from "vitest";
import { GitHubIssueWatcher } from "../integrations/github-watcher/watcher.mjs";

const next = "https://api.github.com/repositories/123/issues?state=all&sort=updated&direction=asc&per_page=100&page=2";
const firstPage = Array.from({ length: 100 }, (_, i) => issue(i + 1));
function issue(number: number) {
  return { id: 1000 + number, number, title: `Issue ${number}`, body: `Decision ${number}`, state: "open",
    updated_at: "2026-11-10T12:00:00Z", html_url: `https://github.com/owner/repo/issues/${number}` };
}

function fixture(mode: "current-link" | "missing-link" | "unsafe-link") {
  let secondRun = false;
  const completed = new Set<string>();
  const sent: string[] = [];
  const firstPageTags: Array<string | null> = [];
  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (init.method === "POST") {
      const { eventId } = JSON.parse(String(init.body)) as { eventId: string };
      const duplicate = completed.has(eventId);
      completed.add(eventId); sent.push(eventId);
      return Response.json({ status: duplicate ? "duplicate" : "accepted", state: "completed", eventId }, { status: duplicate ? 200 : 201 });
    }
    if (url === "https://api.github.com/repos/owner/repo") return Response.json({ id: 123, full_name: "owner/repo", private: false });
    if (url === next) return Response.json([issue(101)]);
    const tag = new Headers(init.headers).get("if-none-match");
    firstPageTags.push(tag);
    if (!secondRun) return Response.json(firstPage, { headers: { etag: '"A"' } });
    if (tag) {
      const headers: Record<string, string> = mode === "missing-link" ? {} :
        { link: `<${mode === "unsafe-link" ? "https://other.example/issues?page=2" : next}>; rel="next"` };
      return new Response(null, { status: 304, headers });
    }
    return Response.json(firstPage, { headers: { etag: '"A"', link: `<${next}>; rel="next"` } });
  };
  const watcher = new GitHubIssueWatcher({ repo: "owner/repo", project: "project", cwd: "/work/project", fetch });
  return { watcher, sent, completed, firstPageTags, grow: () => { secondRun = true; } };
}

describe("GitHub connector conditional terminal frontier", () => {
  it("honors a new current304 next link after a cached terminal page of100", async () => {
    const h = fixture("current-link");
    expect(await h.watcher.syncOnce()).toEqual({ complete: true, pages: 1, issues: 100, completed: 100, duplicates: 0, notModifiedPages: 0 });
    h.grow();
    expect(await h.watcher.syncOnce()).toEqual({ complete: true, pages: 2, issues: 101, completed: 1, duplicates: 100, notModifiedPages: 1 });
    expect(h.completed.size).toBe(101);
    expect(h.sent).toHaveLength(201);
  });

  it("unconditionally refreshes a cached terminal frontier when304 has no pagination metadata", async () => {
    const h = fixture("missing-link");
    expect((await h.watcher.syncOnce()).completed).toBe(100);
    h.grow();
    expect(await h.watcher.syncOnce()).toEqual({ complete: true, pages: 2, issues: 101, completed: 1, duplicates: 100, notModifiedPages: 1 });
    expect(h.firstPageTags).toEqual([null, '"A"', null]);
    expect(h.completed.size).toBe(101);
  });

  it("validates current304 next-link origin before resending any cached item", async () => {
    const h = fixture("unsafe-link");
    expect((await h.watcher.syncOnce()).completed).toBe(100);
    h.grow();
    await expect(h.watcher.syncOnce()).rejects.toThrow("escaped the selected repository");
    expect(h.sent).toHaveLength(100);
    expect(h.completed.size).toBe(100);
  });
});
