import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { basename, join } from "node:path";

interface CapturedRequest {
  path: string;
  body: Record<string, unknown>;
}

async function setupPlugin(directory: string) {
  vi.resetModules();
  const requests: CapturedRequest[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    requests.push({
      path: new URL(url).pathname,
      body: init?.body ? JSON.parse(String(init.body)) : {},
    });
    return new Response(JSON.stringify({ context: "" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }));

  const { AgentmemoryCapturePlugin } = await import(
    "../plugin/opencode/agentmemory-capture.ts"
  );
  const hooks = await AgentmemoryCapturePlugin({
    directory,
    worktree: "/",
    project: { id: "opaque-project-id" },
  } as never);

  return { hooks: hooks as Record<string, (...args: any[]) => Promise<void>>, requests };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AGENTMEMORY_PROJECT;
});

describe("OpenCode project scoping", () => {
  it("uses the repository basename for project and preserves the full cwd", async () => {
    const cwd = join(process.cwd(), "plugin");
    const repositoryRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
    }).trim();
    const { hooks, requests } = await setupPlugin(cwd);

    await hooks.event({
      event: {
        type: "session.created",
        properties: { info: { id: "session-1", directory: cwd } },
      },
    });

    const start = requests.find((request) => request.path === "/agentmemory/session/start");
    expect(start?.body.project).toBe(basename(repositoryRoot));
    expect(start?.body.cwd).toBe(cwd);
  });

  it("keeps structured file arguments in tool observations", async () => {
    const cwd = join(process.cwd(), "plugin");
    const { hooks, requests } = await setupPlugin(cwd);

    await hooks.event({
      event: {
        type: "session.created",
        properties: { info: { id: "session-2", directory: cwd } },
      },
    });
    await hooks.event({
      event: {
        type: "message.part.updated",
        properties: {
          part: {
            type: "tool",
            sessionID: "session-2",
            callID: "call-1",
            tool: "read",
            state: {
              status: "completed",
              input: { filePath: join(cwd, "opencode", "agentmemory-capture.ts") },
              output: "contents",
            },
          },
        },
      },
    });

    const observations = requests.filter((request) => request.path === "/agentmemory/observe");
    const toolObservation = observations.find(
      (request) => (request.body.data as Record<string, unknown>)?.tool_name === "read",
    );
    const data = toolObservation?.body.data as Record<string, unknown>;
    expect(data.tool_input).toMatchObject({
      filePath: join(cwd, "opencode", "agentmemory-capture.ts"),
    });
  });

  it("recognizes lowercase OpenCode file tool names for enrichment", async () => {
    const cwd = join(process.cwd(), "plugin");
    const filePath = join(cwd, "opencode", "agentmemory-capture.ts");
    const { hooks, requests } = await setupPlugin(cwd);

    await hooks.event({
      event: {
        type: "session.created",
        properties: { info: { id: "session-3", directory: cwd } },
      },
    });
    await hooks["tool.execute.before"](
      { sessionID: "session-3", tool: "read" },
      { args: { filePath } },
    );
    await hooks["experimental.chat.system.transform"](
      { sessionID: "session-3" },
      { system: [] },
    );

    const enrich = requests.find((request) => request.path === "/agentmemory/enrich");
    expect(enrich?.body.files).toEqual([filePath]);
  });
});
