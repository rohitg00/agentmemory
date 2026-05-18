import { describe, expect, it } from "vitest";
import { registerApiTriggers } from "../src/triggers/api.js";
import { KV } from "../src/state/schema.js";
import type { Session } from "../src/types.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

function setupApi() {
  const sdk = mockSdk();
  const kv = mockKV();
  sdk.registerFunction("mem::context", async () => ({ context: "" }));
  registerApiTriggers(sdk as never, kv as never);
  return { sdk, kv };
}

describe("api::session::start", () => {
  it("uses title as summary and firstPrompt fallback", async () => {
    const { sdk, kv } = setupApi();

    await sdk.trigger("api::session::start", {
      body: {
        sessionId: "ses_title",
        project: "/tmp/project",
        cwd: "/tmp/project",
        title: "Add OpenCode memory integration",
      },
    });

    const session = await kv.get<Session>(KV.sessions, "ses_title");
    expect(session?.summary).toBe("Add OpenCode memory integration");
    expect(session?.firstPrompt).toBe("Add OpenCode memory integration");
  });

  it("keeps explicit summary and firstPrompt distinct", async () => {
    const { sdk, kv } = setupApi();

    const res = (await sdk.trigger("api::session::start", {
      body: {
        sessionId: "ses_prompt",
        project: "/tmp/project",
        cwd: "/tmp/project",
        title: "OpenCode follow-up",
        summary: "Investigate OpenCode session names",
        firstPrompt: "Why do OpenCode sessions show raw IDs?",
      },
    })) as { status_code: number; body: { session: Session } };

    const session = await kv.get<Session>(KV.sessions, "ses_prompt");
    expect(res.status_code).toBe(200);
    expect(res.body.session.summary).toBe("Investigate OpenCode session names");
    expect(res.body.session.firstPrompt).toBe(
      "Why do OpenCode sessions show raw IDs?",
    );
    expect(session?.summary).toBe("Investigate OpenCode session names");
    expect(session?.firstPrompt).toBe("Why do OpenCode sessions show raw IDs?");
  });
});
