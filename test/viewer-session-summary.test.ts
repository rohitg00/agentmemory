import * as vm from "node:vm";
import { describe, expect, it } from "vitest";
import { renderViewerDocument } from "../src/viewer/document.js";

// Session summaries arrive on GET /agentmemory/sessions as either a plain
// string (legacy title slice) or the full SessionSummary object merged by
// api::sessions. The Sessions tab must render readable text in both shapes
// and never the literal "[object Object]" (issue #1229).
function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function loadViewerSandbox() {
  const rendered = renderViewerDocument();
  expect(rendered.found).toBe(true);
  if (!rendered.found) throw new Error("viewer document not found");

  const scriptMatch = rendered.html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
  expect(scriptMatch).not.toBeNull();
  if (!scriptMatch) throw new Error("viewer script not found");

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
    .replace(/\n\s*switchTab\(tabFromRoute\(\)[^;]*;\n/, "\n")
    .replace(/\n\s*\(async function initWs\(\)[\s\S]*?\}\)\(\);\n/, "\n")
    .replace(/\n\s*startDashboardAutoRefresh\(\);\n/, "\n");

  // The strip must actually fire. If the viewer script's startup tail
  // changes shape, fail loudly here instead of silently running startup
  // code (WebSocket/fetch chains) inside every rendering test.
  expect(scriptWithoutAutoStart).not.toBe(scriptMatch[1]);

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

  it("labels and joins the other list fields of an object summary", () => {
    const { sandbox, getElement } = loadViewerSandbox();
    sandbox.state.sessions.items = [baseSession({ summary: sessionSummaryObject })];
    sandbox.state.sessions.selectedId = "20260811_113447_ba4a38";

    // The list preview truncates at 140 chars, so assert the labeled lists
    // through the full serialization the detail panel renders (600 chars).
    const text = sandbox.sessionSummaryText({ summary: sessionSummaryObject });
    expect(text).toContain("Key decisions: Ship API v1 behind a flag, Keep v0 fallback for a release");
    expect(text).toContain("Files: integrations/todoist.ts, skills/todoist.md");
    expect(text).toContain("Concepts: api-migration, skills");

    return sandbox.renderSessionDetail().then(() => {
      const html = getElement("session-detail").innerHTML;
      expect(html).not.toContain("[object Object]");
      expect(html).toContain("Files:");
      expect(html).toContain("integrations/todoist.ts");
      expect(html).toContain("Concepts:");
      expect(html).toContain("api-migration");
    });
  });

  it("renders the detail panel preview from an object summary", async () => {
    const { sandbox, getElement } = loadViewerSandbox();
    sandbox.state.sessions.items = [baseSession({ summary: sessionSummaryObject })];
    sandbox.state.sessions.selectedId = "20260811_113447_ba4a38";

    await sandbox.renderSessionDetail();

    const html = getElement("session-detail").innerHTML;
    expect(html).not.toContain("[object Object]");
    expect(html).toContain("Migrated the Todoist integration to API v1");
    expect(html).toContain("Ship API v1 behind a flag");
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
    expect(html).toContain("still/works.ts");
  });
});
