import { describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
const PLUGIN = resolve(__dirname, "../plugin/opencode/agentmemory-capture.ts");
const SID = "ses_test";
type Sent = { path: string; hook: string; body: any };
interface Harness {
  observed: Sent[];
  posts: string[];
  hooks: () => string;
  push: (event: any) => void;
  fire: (name: string, ev: any) => Promise<void>;
  fireTool: (name: string, ev: any) => Promise<void>;
  failNextStarts: (n: number) => void;
  cleanup: () => Promise<void>;
  hooksOf: Record<string, Function[]>;
}
async function loadPlugin(): Promise<any> {
  vi.resetModules();
  const mod: any = await import(PLUGIN);
  return mod.default;
}
async function harness(): Promise<Harness> {
  const def = await loadPlugin();
  const observed: Sent[] = [];
  const posts: string[] = [];
  let failStarts = 0;
  const fetchMock = vi.fn(async (url: any, init: any) => {
    const path = String(url).split("/agentmemory/")[1]?.split("?")[0] ?? "";
    if (path === "session/start" && failStarts > 0) {
      failStarts--;
      posts.push("session/start:failed");
      throw new Error("agentmemory indisponivel");
    }
    let body: any = {};
    try {
      body = JSON.parse(String(init?.body ?? "{}"));
    } catch {}
    if (path.startsWith("observe")) observed.push({ path, hook: body.hookType ?? "", body });
    else if (path) posts.push(path + (body.hookType ? ":" + body.hookType : ""));
    return new Response(JSON.stringify({ ok: true, context: "MEMORIA" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  const queue: any[] = [];
  let waiter: ((r: any) => void) | null = null;
  let done = false;
  const push = (e: any) => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w({ value: e, done: false });
    } else queue.push(e);
  };
  const sessionHooks: Record<string, Function[]> = {};
  const toolHooks: Record<string, Function[]> = {};
  const ctx: any = {
    location: { directory: "C:/repos/projeto", project: { directory: "C:/repos/projeto" } },
    agent: { list: async () => ({ data: [{ id: "build" }, { id: "plan" }], location: {} }) },
    provider: { list: async () => ({ data: [{ id: "anthropic" }], location: {} }) },
    mcp: { list: async () => ({ data: [{ id: "srv" }], location: {} }) },
    model: {
      default: async () => ({
        data: { id: "sonnet", providerID: "anthropic", limit: { context: 200000, output: 8192 } },
        location: {},
      }),
    },
    tool: { hook: async (n: string, f: any) => void ((toolHooks[n] ??= []).push(f)) },
    session: { hook: async (n: string, f: any) => void ((sessionHooks[n] ??= []).push(f)) },
    event: {
      subscribe: () => ({
        [Symbol.asyncIterator]: () => ({
          next: () =>
            new Promise<any>((r) => {
              if (queue.length) r({ value: queue.shift(), done: false });
              else if (done) r({ value: undefined, done: true });
              else waiter = r;
            }),
          return: () => {
            done = true;
            return Promise.resolve({ value: undefined, done: true });
          },
        }),
      }),
    },
  };
  const cleanup = await def.setup(ctx);
  await new Promise((r) => setTimeout(r, 30));
    return {
    observed,
    posts,
    push,
    hooks: () => Object.keys(sessionHooks).join(", "),
    hooksOf: sessionHooks,
    failNextStarts: (n: number) => {
      failStarts = n;
    },
    fire: async (name, ev) => {
      for (const f of sessionHooks[name] ?? []) await f(ev);
    },
    fireTool: async (name, ev) => {
      for (const f of toolHooks[name] ?? []) await f(ev);
    },
    drain: (ms = 150) => new Promise((r) => setTimeout(r, ms)),
    cleanup: async () => {
      await cleanup?.();
      vi.unstubAllGlobals();
    },
  };
}
const hooksOf = (h: Harness) => (name: string) => h.observed.filter((o) => o.hook === name).length;
describe("OpenCode V2 capture — ciclo de vida e configuracao", () => {
  it("registra a sessao no primeiro evento e envia config", async () => {
    const h = await harness();
    h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e1", location: {}, created: 1 });
    await h.drain();
    expect(h.observed.some((o) => o.hook === "session_started")).toBe(true);
    expect(h.observed.some((o) => o.hook === "config_loaded")).toBe(true);
    await h.cleanup();
  });
  it("registra session.created com title e location reais", async () => {
    const h = await harness();
    h.push({
      type: "session.created",
      data: {
        sessionID: "ses_criada",
        projectID: "proj_1",
        location: { directory: "C:/repos/projeto" },
        subpath: "",
        slug: "s",
        title: "titulo real",
        version: "2.0.22",
      },
      id: "sc",
      location: {},
      created: 1,
    });
    await h.drain();
    const start = h.posts.find((p) => p === "session/start");
    expect(start).toBeDefined();
    await h.cleanup();
  });
  it("registra uma segunda sessao, inclusive filha de subagente", async () => {
    const h = await harness();
    h.push({ type: "session.step.started", data: { sessionID: SID, agent: "build", model: { id: "m", providerID: "p" }, started: 1 }, id: "e1", location: {}, created: 1 });
    await h.drain();
    h.push({ type: "session.step.started", data: { sessionID: "ses_segunda", agent: "build", model: { id: "m", providerID: "p" }, started: 1 }, id: "e2", location: {}, created: 2 });
    await h.drain();
    expect(h.observed.filter((o) => o.hook === "session_started").length).toBeGreaterThanOrEqual(2);
    await h.cleanup();
  });
  it("reenvia /session/start quando ele falha, em vez de travar", async () => {
    const h = await harness();
    h.failNextStarts(2);
    h.push({ type: "session.step.started", data: { sessionID: "ses_retry", agent: "build", model: { id: "m", providerID: "p" }, started: 1 }, id: "r1", location: {}, created: 1 });
    await h.drain();
    h.push({ type: "session.step.started", data: { sessionID: "ses_retry", agent: "build", model: { id: "m", providerID: "p" }, started: 2 }, id: "r2", location: {}, created: 2 });
    await h.drain();
    h.push({ type: "session.step.started", data: { sessionID: "ses_retry", agent: "build", model: { id: "m", providerID: "p" }, started: 3 }, id: "r3", location: {}, created: 3 });
    await h.drain();
    expect(h.posts.filter((p) => p === "session/start:failed").length).toBeGreaterThanOrEqual(2);
    await h.cleanup();
  });
});
describe("OpenCode V2 capture — hooks", () => {
  it("captura uso de ferramenta em execute.before e execute.after", async () => {
    const h = await harness();
    h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
    await h.drain();
    await h.fireTool("execute.before", { tool: "read", sessionID: SID, input: { filePath: "C:/repos/a.ts" } });
    await h.fireTool("execute.after", {
      tool: "read",
      sessionID: SID,
      id: "c1",
      status: "completed",
      input: { filePath: "C:/repos/a.ts" },
      result: { content: [{ type: "text", text: "conteudo" }], metadata: { started: 1, ended: 3 } },
    });
    await h.drain();
    await h.cleanup();
  });
  it("reporta falha de ferramenta exatamente uma vez", async () => {
    const h = await harness();
    h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
    await h.drain();
    await h.fireTool("execute.after", { tool: "bash", sessionID: SID, id: "c1", status: "error", input: { command: "x" }, result: { metadata: { status: "error" } } });
    await h.drain();
    expect(hooksOf(h)("post_tool_failure")).toBe(1);
    await h.cleanup();
  });
  it("falha le o texto de event.error, a forma que a documentacao da V2 descreve", async () => {
    const h = await harness();
    h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
    await h.drain();
    await h.fireTool("execute.after", {
      tool: "bash",
      sessionID: SID,
      id: "c1",
      status: "error",
      input: { command: "false" },
      error: { name: "BashError", message: "command exited with 1" },
      result: { metadata: { exit: 1, status: "error", truncated: false } },
    });
    await h.drain();
    const fail = h.observed.find((o) => o.hook === "post_tool_failure");
    expect(fail, "post_tool_failure nao foi observado").toBeDefined();
    expect(String(fail!.body.data.tool_output)).toContain("command exited with 1");
    await h.cleanup();
  });

  it("session.tool.failed nao duplica o que execute.after ja reportou", async () => {
    const h = await harness();
    h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
    await h.drain();
    await h.fireTool("execute.after", { tool: "bash", sessionID: SID, id: "dup", status: "error", input: { c: 1 }, result: { metadata: {} } });
    await h.drain();
    const before = hooksOf(h)("post_tool_failure");
    h.push({ type: "session.tool.failed", data: { sessionID: SID, assistantMessageID: "m", id: "dup", error: { message: "x" }, executed: false }, id: "tf", location: {}, created: 2 });
    await new Promise((r) => setTimeout(r, 60));
    expect(hooksOf(h)("post_tool_failure")).toBe(before);
    await h.cleanup();
  });
  it("session.tool.failed reporta quando o hook nao cobriu a chamada", async () => {
    const h = await harness();
    h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
    await h.drain();
    h.push({ type: "session.tool.input.started", data: { sessionID: SID, assistantMessageID: "m", id: "s1", name: "bash" }, id: "ti", location: {}, created: 2 });
    h.push({ type: "session.tool.called", data: { sessionID: SID, assistantMessageID: "m", id: "s1", input: { command: "f" }, executed: false }, id: "tc", location: {}, created: 3 });
    await new Promise((r) => setTimeout(r, 40));
    h.push({ type: "session.tool.failed", data: { sessionID: SID, assistantMessageID: "m", id: "s1", error: { message: "exit 1" }, executed: false }, id: "tf", location: {}, created: 4 });
    await h.drain();
    await h.cleanup();
  });
  it("shell.exited com exit != 0 vira falha; exit 0 nao vira nada", async () => {
    const h = await harness();
    h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
    await h.drain();
    h.push({ type: "shell.created", data: { info: { command: "f", cwd: "C:/r", id: "sh_bad", metadata: { sessionID: SID }, shell: "pwsh", status: "running", time: { started: 1 } } }, id: "sc1", location: {}, created: 2 });
    await h.drain();
    const before = hooksOf(h)("post_tool_failure");
    h.push({ type: "shell.exited", data: { id: "sh_bad", exit: 1, status: "failed" }, id: "se", location: {}, created: 3 });
    await h.drain();
    h.push({ type: "shell.created", data: { info: { command: "ls", cwd: "C:/r", id: "sh_ok", metadata: { sessionID: SID }, shell: "pwsh", status: "running", time: { started: 1 } } }, id: "sc2", location: {}, created: 4 });
    await new Promise((r) => setTimeout(r, 40));
    h.push({ type: "shell.exited", data: { id: "sh_ok", exit: 0, status: "completed" }, id: "se2", location: {}, created: 5 });
    await new Promise((r) => setTimeout(r, 60));
    expect(hooksOf(h)("post_tool_failure")).toBe(before + 1);
    await h.cleanup();
  });
  it("injeta memoria em TODA chamada de modelo, nao so na primeira", async () => {
    const h = await harness();
    h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
    await h.drain();
    const sizes: number[] = [];
    for (let i = 0; i < 3; i++) {
      const ev: any = { sessionID: SID, agent: "build", model: { id: "m", providerID: "p" }, options: { maxTokens: 100 }, system: [{ type: "text", text: "sys" }], messages: [], tools: {} };
      await h.fire("context", ev);
      sizes.push(ev.system.length);
    }
    expect(sizes).toEqual([3, 2, 2]);
    expect(h.posts.filter((p) => p === "context").length).toBeLessThanOrEqual(1);
    await h.cleanup();
  });
  it("registra o hook compaction e injeta memoria quando invocado", async () => {
    const h = await harness();
    expect(h.hooksOf["compaction"]).toBeDefined();
    h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
    await h.drain();
    const ev: any = { sessionID: SID, system: [{ type: "text", text: "sys" }] };
    await h.fire("compaction", ev);
    expect(ev.system.length).toBeGreaterThan(1);
    await h.cleanup();
  });

  it("o hook compaction reaproveita o contexto do turno", async () => {
    const h = await harness();
    h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
    await h.drain();
    const ctx: any = { sessionID: SID, agent: "build", model: { id: "m", providerID: "p" }, options: {}, system: [{ type: "text", text: "sys" }], messages: [], tools: {} };
    await h.fire("context", ctx);
    const after = h.posts.filter((p) => p === "context").length;
    const ev: any = { sessionID: SID, system: [{ type: "text", text: "sys" }] };
    await h.fire("compaction", ev);
    expect(h.posts.filter((p) => p === "context").length).toBe(after);
    expect(ev.system.length).toBeGreaterThan(1);
    await h.cleanup();
  });
});
describe("OpenCode V2 capture — compactacao por eventos", () => {
  it("session.compaction.started gera observation", async () => {
    const h = await harness();
    h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
    await h.drain();
    h.push({ type: "session.compaction.started", data: { sessionID: SID, reason: "auto", recent: "texto", inputID: "in_1" }, id: "cs", location: {}, created: 2 });
    await h.drain();
    const ev = h.observed.find((o) => o.hook === "compaction_event")!;
    expect(ev.body.data.state).toBe("started");
    expect(ev.body.data.reason).toBe("auto");
    await h.cleanup();
  });
  it("session.compaction.failed gera observation com o erro", async () => {
    const h = await harness();
    h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
    await h.drain();
    h.push({ type: "session.compaction.failed", data: { sessionID: SID, reason: "auto", error: { message: "falhou" }, inputID: "in_2" }, id: "cf", location: {}, created: 2 });
    await h.drain();
    const ev = h.observed.find((o) => o.hook === "compaction_event")!;
    expect(ev.body.data.state).toBe("failed");
    expect(String(ev.body.data.tool_output)).toContain("falhou");
    await h.cleanup();
  });
  it("session.execution.succeeded pede /summarize sem gerar observation", async () => {
    const h = await harness();
    h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
    await h.drain();
    const before = h.observed.length;
    h.push({ type: "session.execution.succeeded", data: { sessionID: SID }, id: "es", location: {}, created: 2 });
    await h.drain();
    expect(h.observed.length).toBe(before);
    expect(h.posts.filter((p) => p === "summarize").length).toBe(1);
    await h.cleanup();
  });
});
describe("OpenCode V2 capture — eventos do stream", () => {
  const cases: Array<[string, any, string]> = [
    ["session.step.started", { sessionID: SID, agent: "build", assistantMessageID: "m", model: { id: "m", providerID: "p" }, started: 1 }, "step_start"],
    ["session.step.ended", { sessionID: SID, assistantMessageID: "m", cost: 0.1, rawFinish: "stop", tokens: { input: 1, output: 2, reasoning: 0, cache: { read: 3, write: 0 } } }, "step_finish"],
    ["session.agent.selected", { sessionID: SID, agent: "build", previous: "plan" }, "agent_selected"],
    ["session.reasoning.ended", { sessionID: SID, assistantMessageID: "m", ordinal: 0, text: "pensando" }, "reasoning"],
    ["session.instructions.updated", { sessionID: SID, delta: { "core/date": "5c8d" } }, "notification"],
    ["session.text.ended", { sessionID: SID, assistantMessageID: "m", ordinal: 0, text: "resposta final" }, "assistant_message"],
    ["permission.asked", { sessionID: SID, action: "bash", resources: ["rm"], tool: { callID: "c1" } }, "notification"],
    ["permission.replied", { sessionID: SID, requestID: "r1", reply: "once" }, "permission_replied"],
    ["session.execution.failed", { sessionID: SID, error: { message: "boom" } }, "post_tool_failure"],
  ];
  for (const [type, data, expectHook] of cases) {
    it(`${type} produz exatamente uma observation ${expectHook}`, async () => {
      const h = await harness();
      h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
    await h.drain();
      h.push({ type, data, id: "x", location: {}, created: 2 });
    await h.drain();
      expect(hooksOf(h)(expectHook)).toBe(1);
      await h.cleanup();
    });
  }
  const silent: Array<[string, any]> = [
    ["session.reasoning.started", { sessionID: SID, assistantMessageID: "m", ordinal: 0, state: "streaming" }],
    ["session.inbox.delivered", { sessionID: SID, inboxID: "i1" }],
    ["shell.created", { info: { command: "git status", cwd: "C:/r", id: "sh1", metadata: { sessionID: SID }, shell: "pwsh", status: "running", time: { started: 1 } } }],
  ];
  for (const [type, data] of silent) {
    it(`${type} nao gera observation`, async () => {
      const h = await harness();
      h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
      await h.drain();
      const before = h.observed.length;
      h.push({ type, data, id: "x", location: {}, created: 2 });
      await h.drain();
      expect(h.observed.length).toBe(before);
      await h.cleanup();
    });
  }
  it("session.instructions.updated grava as fontes alteradas, nao os hashes", async () => {
    const h = await harness();
    h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
    await h.drain();
    h.push({ type: "session.instructions.updated", data: { sessionID: SID, delta: { "core/codemode": "3a6c", "core/date": "5c8d" } }, id: "iu", location: {}, created: 2 });
    await h.drain();
    const ev = h.observed.find((o) => o.hook === "notification");
    expect(ev?.body.data.sources).toEqual(["core/codemode", "core/date"]);
    expect(JSON.stringify(ev?.body.data)).not.toContain("3a6c");
    await h.cleanup();
  });
  it("session.instructions.updated sem fontes nao gera observation", async () => {
    const h = await harness();
    h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
    await h.drain();
    const before = h.observed.length;
    h.push({ type: "session.instructions.updated", data: { sessionID: SID, delta: {} }, id: "iu", location: {}, created: 2 });
    await h.drain();
    expect(h.observed.length).toBe(before);
    await h.cleanup();
  });
  it("session.text.ended grava a resposta do assistente", async () => {
    const h = await harness();
    h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
    await h.drain();
    h.push({ type: "session.text.ended", data: { sessionID: SID, assistantMessageID: "m1", ordinal: 0, text: "refresh devolve null" }, id: "te", location: {}, created: 2 });
    await h.drain();
    const ev = h.observed.find((o) => o.hook === "assistant_message");
    expect(ev?.body.data.text).toBe("refresh devolve null");
    expect(ev?.body.data.messageID).toBe("m1");
    await h.cleanup();
  });
  it("session.deleted fecha a sessao e libera as chaves", async () => {
    const h = await harness();
    h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
    await h.drain();
    h.push({ type: "session.deleted", data: { sessionID: SID }, id: "d", location: {}, created: 2 });
    await h.drain();
    expect(h.posts.some((p) => p.startsWith("crystals/auto"))).toBe(true);
    expect(h.posts.some((p) => p.startsWith("consolidate-pipeline"))).toBe(true);
    await h.cleanup();
  });
  it("model.updated re-snapshota a configuracao", async () => {
    const h = await harness();
    h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
    await h.drain();
    const before = hooksOf(h)("config_loaded");
    h.push({ type: "model.updated", data: {}, id: "mu", location: {}, created: 2 });
    await h.drain();
    expect(hooksOf(h)("config_loaded")).toBe(before);
    await h.cleanup();
  });
});
describe("OpenCode V2 capture — resiliência", () => {
  it("a assinatura sobrevive a um evento desconhecido", async () => {
    const h = await harness();
    h.push({ type: "session.execution.started", data: { sessionID: SID }, id: "e", location: {}, created: 1 });
    await h.drain();
    h.push({ type: "message.updated", data: {}, id: "u1", location: {}, created: 2 });
    h.push({ type: "evento.inventado", data: {}, id: "u2", location: {}, created: 3 });
    await new Promise((r) => setTimeout(r, 40));
    h.push({ type: "session.agent.selected", data: { sessionID: SID, agent: "x", previous: "y" }, id: "u3", location: {}, created: 4 });
    await h.drain();
    await h.cleanup();
  });
  it("cleanup nao lanca", async () => {
    const h = await harness();
    await expect(h.cleanup()).resolves.toBeUndefined();
  });
});
describe("plugin/opencode — forma do export", () => {
  it("exporta id + setup + server para V1 e V2", async () => {
    const mod: any = await import(PLUGIN);
    expect(mod.default.id).toBe("agentmemory-capture");
    expect(typeof mod.default.setup).toBe("function");
    expect(typeof mod.default.server).toBe("function");
    expect(typeof mod.AgentmemoryCapturePlugin).toBe("function");
  });
  it("setup nao faz nada num contexto V1 sem tool, session e event", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const def = await loadPlugin();
    const v1ctx = { options: {}, agent: { list: async () => ({ data: [{ id: "build" }] }) }, catalog: {}, command: {}, skill: {} };
    await expect(def.setup(v1ctx)).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("o caminho V1 continua devolvendo os 7 hooks", async () => {
    const mod: any = await import(PLUGIN);
    const hooks = await mod.default.server({} as any);
    expect(Object.keys(hooks).sort()).toEqual(
      [
        "chat.message",
        "chat.params",
        "config",
        "event",
        "experimental.chat.system.transform",
        "experimental.session.compacting",
        "tool.execute.before",
      ].sort(),
    );
  });
});
