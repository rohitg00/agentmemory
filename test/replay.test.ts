import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseJsonlText } from "../src/replay/jsonl-parser.js";
import { projectTimeline } from "../src/replay/timeline.js";
import { rawFromCompressed } from "../src/functions/replay.js";
import type { CompressedObservation } from "../src/types.js";

const fx = (name: string) =>
  readFileSync(join(__dirname, "fixtures/jsonl", name), "utf-8");

describe("parseJsonlText", () => {
  it("parses basic user/assistant exchange", () => {
    const out = parseJsonlText(fx("basic.jsonl"));
    expect(out.sessionId).toBe("sess-basic");
    expect(out.project).toBe("project");
    expect(out.cwd).toBe("/Users/alice/project");
    expect(out.observations).toHaveLength(2);
    expect(out.observations[0].hookType).toBe("prompt_submit");
    expect(out.observations[0].userPrompt).toBe("Fix the login bug");
    expect(out.observations[1].hookType).toBe("stop");
    expect(out.observations[1].assistantResponse).toBe("Looking into it now.");
  });

  it("parses tool_use + tool_result pairs", () => {
    const out = parseJsonlText(fx("tool-use.jsonl"));
    expect(out.sessionId).toBe("sess-tool");
    const kinds = out.observations.map((o) => o.hookType);
    expect(kinds).toEqual([
      "prompt_submit",
      "pre_tool_use",
      "post_tool_use",
      "stop",
    ]);
    const toolCall = out.observations[1];
    expect(toolCall.toolName).toBe("Bash");
    expect((toolCall.toolInput as { command: string }).command).toBe("ls");
    const toolResult = out.observations[2];
    expect(toolResult.toolOutput).toBe("README.md\nsrc\n");
  });

  it("tolerates malformed lines and marks tool errors", () => {
    const out = parseJsonlText(fx("errors.jsonl"));
    const errObs = out.observations.find((o) => o.hookType === "post_tool_failure");
    expect(errObs).toBeDefined();
    expect(errObs?.toolOutput).toBe("exit 1");
  });

  it("falls back to generated sessionId when missing", () => {
    const text = JSON.stringify({
      type: "user",
      timestamp: "2026-01-01T00:00:00.000Z",
      message: { role: "user", content: [{ type: "text", text: "hi" }] },
    });
    const out = parseJsonlText(text);
    expect(out.sessionId).toMatch(/^sess_/);
  });

  it("returns empty observations for blank input", () => {
    const out = parseJsonlText("");
    expect(out.observations).toHaveLength(0);
  });

  it("prefers the file's sessionId over the fallback", () => {
    const text = [
      JSON.stringify({
        type: "user",
        sessionId: "real-session-from-file",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: { role: "user", content: [{ type: "text", text: "hi" }] },
      }),
    ].join("\n");
    const out = parseJsonlText(text, "fallback-should-be-ignored");
    expect(out.sessionId).toBe("real-session-from-file");
    for (const obs of out.observations) {
      expect(obs.sessionId).toBe("real-session-from-file");
    }
  });

  it("returns the same sessionId across repeated parses of one file", () => {
    const text = JSON.stringify({
      type: "user",
      sessionId: "stable-id",
      timestamp: "2026-01-01T00:00:00.000Z",
      message: { role: "user", content: [{ type: "text", text: "hi" }] },
    });
    const a = parseJsonlText(text, "fb-1");
    const b = parseJsonlText(text, "fb-2");
    expect(a.sessionId).toBe("stable-id");
    expect(b.sessionId).toBe("stable-id");
  });

  it("uses the fallback only when the file has no sessionId", () => {
    const text = JSON.stringify({
      type: "user",
      timestamp: "2026-01-01T00:00:00.000Z",
      message: { role: "user", content: [{ type: "text", text: "hi" }] },
    });
    const out = parseJsonlText(text, "fb-used");
    expect(out.sessionId).toBe("fb-used");
  });
});

describe("projectTimeline", () => {
  it("preserves ordering and computes offsets from real timestamps", () => {
    const parsed = parseJsonlText(fx("tool-use.jsonl"));
    const tl = projectTimeline(parsed.observations);
    expect(tl.eventCount).toBe(4);
    expect(tl.events[0].kind).toBe("prompt");
    expect(tl.events[1].kind).toBe("tool_call");
    expect(tl.events[2].kind).toBe("tool_result");
    expect(tl.events[3].kind).toBe("response");
    expect(tl.events[0].offsetMs).toBe(0);
    expect(tl.events[3].offsetMs).toBeGreaterThan(0);
  });

  it("synthesizes pacing when all timestamps identical", () => {
    const parsed = parseJsonlText(fx("basic.jsonl"));
    for (const obs of parsed.observations) obs.timestamp = "2026-04-17T10:00:00.000Z";
    const tl = projectTimeline(parsed.observations);
    expect(tl.events[0].offsetMs).toBe(0);
    expect(tl.events[1].offsetMs).toBeGreaterThanOrEqual(300);
  });

  it("returns empty timeline for no observations", () => {
    const tl = projectTimeline([]);
    expect(tl.eventCount).toBe(0);
    expect(tl.totalDurationMs).toBe(0);
    expect(tl.events).toHaveLength(0);
  });

  it("marks errored tool results as tool_error kind", () => {
    const parsed = parseJsonlText(fx("errors.jsonl"));
    const tl = projectTimeline(parsed.observations);
    expect(tl.events.some((e) => e.kind === "tool_error")).toBe(true);
  });

  it("uses one shared fallback timestamp when metadata missing", () => {
    const text = JSON.stringify({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "hi" }] },
    });
    const out = parseJsonlText(text);
    expect(out.startedAt).toBe(out.endedAt);
  });
});

// 基础工厂：生成最小合法的 CompressedObservation，允许按需覆盖字段。
function makeCompressed(
  overrides: Partial<CompressedObservation> & { type: CompressedObservation["type"] },
): CompressedObservation {
  return {
    id: "obs-test-1",
    sessionId: "sess-test",
    timestamp: "2026-04-17T10:00:00.000Z",
    title: "default-title",
    narrative: "default narrative",
    facts: [],
    concepts: [],
    files: [],
    importance: 0.5,
    ...overrides,
  };
}

describe("rawFromCompressed", () => {
  /**
   * 回归测试：压缩->重建 shim 在工具类事件上必须保留可展示内容。
   *
   * 旧版 shim 将所有 CompressedObservation 一律映射为 hookType:"post_tool_use"
   * 但 toolName/toolInput/toolOutput 全部为 undefined，replay detail 面板因此
   * 一片空白。修复后工具类 obs 的 title/subtitle/narrative 应分别流向对应字段。
   */
  it("工具类 observation（command_run）应映射为 post_tool_use，并保留工具内容", () => {
    const obs = makeCompressed({
      type: "command_run",
      title: "Bash",
      subtitle: "ls -la",
      narrative: "README.md\nsrc\n",
      facts: ["ran ls"],
    });

    const raw = rawFromCompressed(obs);

    expect(raw.hookType).toBe("post_tool_use");
    expect(raw.toolName).toBe("Bash");
    expect(raw.toolInput).toBe("ls -la");
    expect(raw.toolOutput).toBe("README.md\nsrc\n");
    expect(raw.userPrompt).toBeUndefined();
    expect(raw.assistantResponse).toBeUndefined();
  });

  it("对话类 observation（conversation）应映射为 prompt_submit，内容取 narrative", () => {
    const obs = makeCompressed({
      type: "conversation",
      title: "User message",
      narrative: "Fix the login bug",
      facts: [],
    });

    const raw = rawFromCompressed(obs);

    expect(raw.hookType).toBe("prompt_submit");
    expect(raw.userPrompt).toBe("Fix the login bug");
    expect(raw.toolName).toBeUndefined();
    expect(raw.toolInput).toBeUndefined();
    expect(raw.toolOutput).toBeUndefined();
    expect(raw.assistantResponse).toBeUndefined();
  });

  it("工具类 observation 在 subtitle 缺失时 toolInput 应为 undefined（不报错）", () => {
    // subtitle 是 CompressedObservation 的可选字段；旧数据可能没有该字段。
    const obs = makeCompressed({
      type: "file_read",
      title: "Read",
      // subtitle 故意省略
      narrative: "file content here",
      facts: [],
    });

    const raw = rawFromCompressed(obs);

    expect(raw.hookType).toBe("post_tool_use");
    expect(raw.toolName).toBe("Read");
    expect(raw.toolInput).toBeUndefined();
    expect(raw.toolOutput).toBe("file content here");
  });

  it("rawFromCompressed 的输出经 projectTimeline 后 detail 字段可在事件中取到", () => {
    // 端到端验证：压缩 obs → rawFromCompressed → projectTimeline → TimelineEvent
    // 工具类事件的 toolName/toolInput/toolOutput 必须出现在最终的 timeline 事件里。
    const toolObs = rawFromCompressed(
      makeCompressed({
        type: "command_run",
        title: "Bash",
        subtitle: "echo hello",
        narrative: "hello",
        facts: [],
      }),
    );
    const convObs = rawFromCompressed(
      makeCompressed({
        id: "obs-test-2",
        type: "conversation",
        title: "User message",
        narrative: "What files are here?",
        facts: [],
        timestamp: "2026-04-17T10:00:01.000Z",
      }),
    );

    const tl = projectTimeline([toolObs, convObs]);

    // 工具结果事件
    const toolEvent = tl.events.find((e) => e.kind === "tool_result");
    expect(toolEvent).toBeDefined();
    expect(toolEvent?.toolName).toBe("Bash");
    expect(toolEvent?.toolInput).toBe("echo hello");
    expect(toolEvent?.toolOutput).toBe("hello");

    // 对话（prompt）事件
    const promptEvent = tl.events.find((e) => e.kind === "prompt");
    expect(promptEvent).toBeDefined();
    expect(promptEvent?.body).toBe("What files are here?");
  });
});

