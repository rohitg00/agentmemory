import * as vm from "node:vm";
import { describe, expect, it } from "vitest";
import { renderViewerDocument } from "../src/viewer/document.js";

// Session summaries arrive on GET /agentmemory/sessions as either a plain
// string (legacy title slice) or the full SessionSummary object merged by
// api::sessions. The Sessions tab must render readable text in both shapes
// and never the literal "[object Object]" (issue #1229).
function htmlEscape(value: string): string {
  // Matches real text-node innerHTML serialization (&, <, >, nbsp only).
  // Double quotes are intentionally NOT escaped — a browser does not
  // escape them in text context, and over-escaping would mask quote
  // breakouts the real viewer could produce.
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\u00a0/g, "&nbsp;");
}
function loadViewerSandbox() {
  const rendered = renderViewerDocument();
  expect(rendered.found).toBe(true);
  if (!rendered.found) throw new Error("viewer document not found");

  const scriptMatch = rendered.html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
  expect(scriptMatch).not.toBeNull();
  if (!scriptMatch) throw new Error("viewer script not found");

  // `any` mirrors the sibling loader in test/viewer-session-id.test.ts:
  // tests assign and read untyped state off the vm sandbox, and tsconfig
  // excludes test/ so the compiler cannot check these shapes.
  const elements = new Map<string, any>();
  const createMockElement = (id = "") => {
    const attributes = new Map<string, string>();
    const classes = new Set<string>();
    const listeners = new Map<string, Array<(event?: unknown) => void>>();
    return {
      id,
      innerHTML: "",
      textContent: "",
      value: "",
      checked: false,
      dataset: {},
      style: {},
      listeners,
      classList: {
        add: (name: string) => classes.add(name),
        remove: (name: string) => classes.delete(name),
        contains: (name: string) => classes.has(name),
        toggle: (name: string, force?: boolean) => {
          const enabled = force ?? !classes.has(name);
          if (enabled) classes.add(name);
          else classes.delete(name);
          return enabled;
        },
      },
      addEventListener: (type: string, handler: (event?: unknown) => void) => {
        const current = listeners.get(type) || [];
        current.push(handler);
        listeners.set(type, current);
      },
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: unknown) => {
        attributes.set(name, String(value));
      },
      removeAttribute: (name: string) => {
        attributes.delete(name);
      },
      querySelectorAll: () => [],
    };
  };
  const getElement = (id: string) => {
    if (!elements.has(id)) elements.set(id, createMockElement(id));
    return elements.get(id);
  };

  const tabs = [
    "dashboard",
    "graph",
    "memories",
    "timeline",
    "sessions",
    "lessons",
    "actions",
    "crystals",
    "audit",
    "activity",
    "profile",
    "replay",
  ];
  const tabButtons = tabs.map((tab) => ({ ...createMockElement(), dataset: { tab } }));
  const views = tabs.map((tab) => ({ ...createMockElement(`view-${tab}`), id: `view-${tab}` }));
  const checkboxes = [createMockElement(), createMockElement()].map((el) => ({ ...el, checked: false }));
  const querySelectorAll = (selector: string) => {
    if (selector === ".tab-bar button") return tabButtons;
    if (selector === ".view") return views;
    if (selector === 'input[type="checkbox"]') return checkboxes;
    return [];
  };

  const document = {
    documentElement: { dataset: {} },
    createElement: () => {
      let text = "";
      return {
        set textContent(value: unknown) {
          text = String(value ?? "");
        },
        get innerHTML() {
          // Matches the sibling loader in test/viewer-session-id.test.ts —
          // the esc() helper in the viewer script round-trips through
          // createElement/textContent/innerHTML escaping.
          return htmlEscape(text);
        },
      };
    },
    getElementById: getElement,
    querySelectorAll,
    addEventListener: () => {},
  };

  const sandbox: Record<string, any> = {
    // `any` here too: the vm sandbox globals are intentionally loose and
    // match the sibling loader's typing (see the comment above).
    console: { log: () => {}, warn: () => {}, error: () => {} },
    document,
    window: {
      location: {
        search: "",
        port: "3113",
        protocol: "http:",
        hostname: "localhost",
        host: "localhost:3113",
        origin: "http://localhost:3113",
      },
      matchMedia: () => ({ matches: false }),
      addEventListener: () => {},
    },
    history: { replaceState: () => {}, pushState: () => {} },
    location: { hash: "", pathname: "/", search: "" },
    localStorage: { getItem: () => null, setItem: () => {} },
    sessionStorage: (() => {
      const values = new Map<string, string>();
      return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      };
    })(),
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    WebSocket: function WebSocket() {},
    navigator: { userAgent: "vitest" },
    Element: function Element() {},
    alert: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    URLSearchParams,
    Date,
    Math,
    Promise,
    JSON,
    Array,
    Object,
    String,
    Number,
    parseInt,
    encodeURIComponent,
  };

  const scriptWithoutAutoStart = scriptMatch[1]
    // The startup call at the script tail is textually identical to the
    // body of syncTabFromRoute() (src/viewer/index.html), so anchor the
    // strip to the startup occurrence with the comment that follows it;
    // an unanchored regex strips the wrong one and leaves startup code
    // running inside every test.
    .replace(/\n\s*switchTab\(tabFromRoute\(\), \{ replaceRoute: true \}\);\n(?=\s*\/\/ Resolve the stream)/, "\n")
    .replace(/\n\s*\(async function initWs\(\)[\s\S]*?\}\)\(\);\n(?=\s*startDashboardAutoRefresh\(\);)/, "\n")
    .replace(/\n\s*startDashboardAutoRefresh\(\);\n/, "\n");

  // The strip must actually fire AND hit the startup tail, not the
  // identically-texted call inside syncTabFromRoute() (which must remain).
  // If the viewer script's startup shape changes, fail loudly here instead
  // of silently running startup code (WebSocket/fetch chains) in every test.
  expect(scriptWithoutAutoStart).not.toBe(scriptMatch[1]);
  const startupCall = 'switchTab(tabFromRoute(), { replaceRoute: true });';
  const callsBefore = scriptMatch[1].split(startupCall).length - 1;
  const callsAfter = scriptWithoutAutoStart.split(startupCall).length - 1;
  expect(callsBefore).toBe(2);
  expect(callsAfter).toBe(callsBefore - 1);
  expect(scriptWithoutAutoStart).not.toContain('startDashboardAutoRefresh();');
  expect(scriptWithoutAutoStart).not.toContain('(async function initWs()');

  vm.createContext(sandbox);
  vm.runInContext(scriptWithoutAutoStart, sandbox);

  return { sandbox, getElement };
}

const sessionSummaryObject = {
  title: "Todoist skill fixes",
  narrative: "Migrated the Todoist integration to API v1 and fixed the skill handlers.",
  concepts: ["api-migration", "skills"],
  filesModified: ["integrations/todoist.ts", "skills/todoist.md"],
  keyDecisions: ["Ship API v1 behind a flag", "Keep v0 fallback for a release"],
};

function baseSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "20260811_113447_ba4a38",
    project: "Cross-project memory",
    cwd: "/tmp/work",
    startedAt: "2026-08-11T11:34:47.000Z",
    status: "completed",
    observationCount: 4,
    ...overrides,
  };
}

describe("viewer session summary rendering", () => {
  it("renders an object summary as readable text in the sessions list", () => {
    const { sandbox, getElement } = loadViewerSandbox();
    sandbox.state.sessions.items = [baseSession({ summary: sessionSummaryObject })];

    sandbox.renderSessions();

    const html = getElement("view-sessions").innerHTML;
    expect(html).not.toContain("[object Object]");
    expect(html).toContain("Todoist skill fixes");
    expect(html).toContain("Migrated the Todoist integration to API v1");
    expect(html).toContain("Key decisions:");
    expect(html).toContain("Ship API v1 behind a flag");
  });

  it("labels and joins the other list fields of an object summary", async () => {
    const { sandbox, getElement } = loadViewerSandbox();
    sandbox.state.sessions.items = [baseSession({ summary: sessionSummaryObject })];
    sandbox.state.sessions.selectedId = "20260811_113447_ba4a38";

    // The list preview truncates at 140 chars, so assert the labeled lists
    // through the full serialization the detail panel renders (600 chars).
    const text = sandbox.sessionSummaryText({ summary: sessionSummaryObject });
    // Exact pin: the full serialization, including labeled-section order.
    expect(text).toBe(
      "Todoist skill fixes — " +
        "Migrated the Todoist integration to API v1 and fixed the skill handlers. — " +
        "Key decisions: Ship API v1 behind a flag, Keep v0 fallback for a release — " +
        "Files: integrations/todoist.ts, skills/todoist.md — " +
        "Concepts: api-migration, skills",
    );

    await sandbox.renderSessionDetail();

    const html = getElement("session-detail").innerHTML;
    expect(html).not.toContain("[object Object]");
    expect(html).toContain("Files:");
    expect(html).toContain("integrations/todoist.ts");
    expect(html).toContain("Concepts:");
    expect(html).toContain("api-migration");
  });

  it("renders the detail panel preview from an object summary", async () => {
    const { sandbox, getElement } = loadViewerSandbox();
    sandbox.state.sessions.items = [baseSession({ summary: sessionSummaryObject })];
    sandbox.state.sessions.selectedId = "20260811_113447_ba4a38";
    // Observations with a recovered prompt must NOT outrank the serialized
    // summary: the detail chain is firstPrompt || summary || firstPromptFromObs.
    sandbox.fetch = async () => ({
      ok: true,
      json: async () => ({
        observations: [{ type: "conversation", userPrompt: "Observed prompt" }],
      }),
    });

    await sandbox.renderSessionDetail();

    const html = getElement("session-detail").innerHTML;
    expect(html).not.toContain("[object Object]");
    expect(html).toContain("Migrated the Todoist integration to API v1");
    expect(html).toContain("Ship API v1 behind a flag");
    expect(html).not.toContain("Observed prompt");
  });

  it("keeps rendering plain string summaries unchanged", () => {
    const { sandbox, getElement } = loadViewerSandbox();
    sandbox.state.sessions.items = [baseSession({ summary: "Legacy plain-text summary" })];

    sandbox.renderSessions();

    const html = getElement("view-sessions").innerHTML;
    expect(html).not.toContain("[object Object]");
    expect(html).toContain("Legacy plain-text summary");
  });

  it("falls back to firstPromptFromObs in the detail panel when summary is missing", async () => {
    const { sandbox, getElement } = loadViewerSandbox();
    sandbox.state.sessions.items = [baseSession()];
    sandbox.state.sessions.selectedId = "20260811_113447_ba4a38";
    sandbox.fetch = async () => ({
      ok: true,
      json: async () => ({
        observations: [{ type: "conversation", userPrompt: "Fix the parser fallback" }],
      }),
    });

    await sandbox.renderSessionDetail();

    const html = getElement("session-detail").innerHTML;
    expect(html).not.toContain("[object Object]");
    expect(html).toContain("Fix the parser fallback");
  });

  it("renders no preview line when summary is missing in the sessions list", () => {
    const { sandbox, getElement } = loadViewerSandbox();
    sandbox.state.sessions.items = [baseSession()];

    sandbox.renderSessions();

    const html = getElement("view-sessions").innerHTML;
    expect(html).not.toContain("[object Object]");
    expect(html).not.toContain("session-preview");
  });

  it("does not throw on a malformed object summary", () => {
    const { sandbox, getElement } = loadViewerSandbox();
    sandbox.state.sessions.items = [
      baseSession({
        summary: {
          title: 42,
          keyDecisions: "not-an-array",
          filesModified: ["still/works.ts"],
        } as unknown as object,
      }),
    ];

    expect(() => sandbox.renderSessions()).not.toThrow();
    const html = getElement("view-sessions").innerHTML;
    expect(html).not.toContain("[object Object]");
    // Title is numeric: it must be dropped, not stringified into the preview.
    // The bare-string keyDecisions field coerces to a one-element list, and
    // the exact preview pins both behaviors.
    expect(html).toContain('>Key decisions: not-an-array — Files: still/works.ts</div>');
    // A numeric narrative must likewise never leak into the text.
    expect(
      sandbox.sessionSummaryText({
        summary: { title: "T", narrative: 99, keyDecisions: ["K"] } as unknown as object,
      }),
    ).toBe("T — Key decisions: K");
  });

  it("skips non-string and empty entries inside summary list fields", () => {
    const { sandbox } = loadViewerSandbox();
    const summary = {
      title: "Mixed entry types",
      narrative: "Narrative body.",
      keyDecisions: ["Real decision", "  ", "", {}, null, 42] as unknown as string[],
      filesModified: ["kept.ts", {}, "also.ts"] as unknown as string[],
      concepts: [{ nested: true }, "concept"] as unknown as string[],
    };
    const text = sandbox.sessionSummaryText({ summary });
    expect(text).not.toContain("[object Object]");
    expect(text).not.toContain("null");
    expect(text).not.toContain("42");
    // Whitespace-only entries must be skipped, not joined as stray ", ," gaps.
    expect(text).not.toContain(", ,");
    // Exact pin: filter + join order for every list field.
    expect(text).toBe(
      "Mixed entry types — Narrative body. — Key decisions: Real decision — " +
        "Files: kept.ts, also.ts — Concepts: concept",
    );
  });

  it("renders firstPrompt over a serialized summary in both render paths", async () => {
    const { sandbox, getElement } = loadViewerSandbox();
    sandbox.state.sessions.items = [
      baseSession({ firstPrompt: "User prompt text", summary: sessionSummaryObject }),
    ];
    sandbox.state.sessions.selectedId = "20260811_113447_ba4a38";

    sandbox.renderSessions();
    const listHtml = getElement("view-sessions").innerHTML;
    expect(listHtml).not.toContain("[object Object]");
    expect(listHtml).toContain("User prompt text");
    expect(listHtml).not.toContain("Todoist skill fixes");

    await sandbox.renderSessionDetail();
    const detailHtml = getElement("session-detail").innerHTML;
    expect(detailHtml).not.toContain("[object Object]");
    expect(detailHtml).toContain("User prompt text");
  });

  it("renders the serialized summary when firstPrompt is absent", () => {
    const { sandbox, getElement } = loadViewerSandbox();
    sandbox.state.sessions.items = [
      baseSession({ firstPrompt: "", summary: sessionSummaryObject }),
    ];

    sandbox.renderSessions();

    const html = getElement("view-sessions").innerHTML;
    expect(html).toContain("Todoist skill fixes");
    expect(html).toContain("Migrated the Todoist integration to API v1");
  });

  it("deduplicates a narrative identical to the title", () => {
    const { sandbox } = loadViewerSandbox();
    expect(
      sandbox.sessionSummaryText({
        summary: { title: "Same text", narrative: "Same text" },
      }),
    ).toBe("Same text");
    // Whitespace-variant duplicates are also deduplicated.
    expect(
      sandbox.sessionSummaryText({
        summary: { title: "Same text", narrative: "  Same text  " },
      }),
    ).toBe("Same text");
    expect(
      sandbox.sessionSummaryText({
        summary: { title: "Same text", narrative: "Same text." },
      }),
    ).toBe("Same text — Same text.");
  });

  it("returns empty text for numeric and empty-object summaries", () => {
    const { sandbox, getElement } = loadViewerSandbox();
    sandbox.state.sessions.items = [
      baseSession({ summary: 42 as unknown as object }),
      baseSession({ id: "20260904_empty_obj", summary: {} }),
    ];

    sandbox.renderSessions();

    const html = getElement("view-sessions").innerHTML;
    expect(html).not.toContain("[object Object]");
    expect(html).not.toContain("session-preview");
  });

  it("renders no preview for a whitespace-only string summary and keeps the detail fallback", async () => {
    const { sandbox, getElement } = loadViewerSandbox();
    sandbox.state.sessions.items = [
      baseSession({ summary: "  \n\t " }),
    ];
    sandbox.state.sessions.selectedId = "20260811_113447_ba4a38";
    sandbox.fetch = async () => ({
      ok: true,
      json: async () => ({
        observations: [{ type: "conversation", userPrompt: "Recovered from observations" }],
      }),
    });

    sandbox.renderSessions();
    const listHtml = getElement("view-sessions").innerHTML;
    expect(listHtml).not.toContain("session-preview");

    await sandbox.renderSessionDetail();
    const detailHtml = getElement("session-detail").innerHTML;
    expect(detailHtml).not.toContain("[object Object]");
    expect(detailHtml).toContain("Recovered from observations");
  });

  it("returns empty text when a summary property getter throws", () => {
    const { sandbox } = loadViewerSandbox();
    const hostile: Record<string, unknown> = {};
    Object.defineProperty(hostile, "title", {
      get() {
        throw new Error("boom");
      },
    });

    expect(sandbox.sessionSummaryText({ summary: hostile })).toBe("");
  });

  it("escapes summary markup through both render paths", async () => {
    const { sandbox, getElement } = loadViewerSandbox();
    const hostileText = {
      title: "<script>alert(1)</script>",
      narrative: 'a & b </div> "quoted"',
      keyDecisions: ["<img src=x>"],
    };
    sandbox.state.sessions.items = [
      baseSession({ summary: hostileText as unknown as object }),
      baseSession({
        id: "20260904_escape_str",
        summary: "<b>bold</b> & more",
      }),
    ];
    sandbox.state.sessions.selectedId = "20260811_113447_ba4a38";

    sandbox.renderSessions();
    const listHtml = getElement("view-sessions").innerHTML;
    expect(listHtml).not.toContain("<script>");
    expect(listHtml).not.toContain("<img");
    expect(listHtml).toContain("&lt;script&gt;");
    expect(listHtml).toContain("&amp;");

    await sandbox.renderSessionDetail();
    const detailHtml = getElement("session-detail").innerHTML;
    expect(detailHtml).not.toContain("<script>alert(1)</script>");
    expect(detailHtml).not.toContain("</div> \"quoted\"");
    expect(detailHtml).toContain("&lt;script&gt;");
    expect(detailHtml).toContain("a &amp; b");
  });

  it("skips zero-width-only entries and summaries", () => {
    const { sandbox } = loadViewerSandbox();
    const text = sandbox.sessionSummaryText({
      summary: {
        title: "Zero-width guard",
        narrative: "Real body.",
        keyDecisions: ["\u200b", "\u200b\u200c", "Real decision"] as unknown as string[],
      },
    });
    expect(text).toContain("Key decisions: Real decision");
    expect(text).not.toContain("\u200b\u200b");
    expect(
      sandbox.sessionSummaryText({ summary: "\u200b\u200b " }),
    ).toBe("");
    // Zero-width-only object fields are invisible too, not just strings.
    expect(
      sandbox.sessionSummaryText({
        summary: { title: "\u200b", narrative: "\u200b", filesModified: ["f.ts"] } as unknown as object,
      }),
    ).toBe("Files: f.ts");
  });

  it("falls through a non-string firstPrompt to the serialized summary", () => {
    const { sandbox, getElement } = loadViewerSandbox();
    sandbox.state.sessions.items = [
      baseSession({
        firstPrompt: { malicious: "object" } as unknown as string,
        summary: sessionSummaryObject,
      }),
    ];

    sandbox.renderSessions();

    const html = getElement("view-sessions").innerHTML;
    expect(html).not.toContain("[object Object]");
    expect(html).toContain("Todoist skill fixes");
  });

  it("does not throw when a hostile summary getter fires through the render paths", async () => {
    const { sandbox, getElement } = loadViewerSandbox();
    const hostileSession: Record<string, unknown> = baseSession();
    Object.defineProperty(hostileSession, "summary", {
      get() {
        throw new Error("boom");
      },
    });
    sandbox.state.sessions.items = [hostileSession];
    sandbox.state.sessions.selectedId = "20260811_113447_ba4a38";

    expect(() => sandbox.renderSessions()).not.toThrow();
    const listHtml = getElement("view-sessions").innerHTML;
    expect(listHtml).not.toContain("[object Object]");

    await sandbox.renderSessionDetail();
    const detailHtml = getElement("session-detail").innerHTML;
    expect(detailHtml).not.toContain("[object Object]");
  });

  it("trims a padded non-empty legacy string summary", () => {
    const { sandbox, getElement } = loadViewerSandbox();
    sandbox.state.sessions.items = [
      baseSession({ summary: "  Padded legacy summary  " }),
    ];

    expect(sandbox.sessionSummaryText({ summary: "  Padded legacy  " })).toBe(
      "Padded legacy",
    );

    sandbox.renderSessions();

    const html = getElement("view-sessions").innerHTML;
    expect(html).toContain("Padded legacy summary");
    expect(html).not.toContain("  Padded");
  });
});
