import * as vm from "node:vm";
import { describe, expect, it } from "vitest";
import { renderViewerDocument } from "../src/viewer/document.js";

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
      // Added in #313 — switchTab toggles aria-selected via removeAttribute
      // on the non-active tab buttons. The mock previously only had
      // get/setAttribute, so the new hash-routing path threw TypeError.
      removeAttribute: (name: string) => {
        attributes.delete(name);
      },
      querySelectorAll: () => [],
      querySelector: () => null,
      closest: () => null,
    };
  };
  const getElement = (id: string) => {
    if (!elements.has(id)) elements.set(id, createMockElement(id));
    return elements.get(id);
  };

  const tabs = [
    "dashboard",
    "memories",
    "lessons",
    "crystals",
    "graph",
    "sessions",
    "timeline",
    "actions",
    "replay",
    "activity",
    "profile",
    "health",
    "audit",
  ];
  const tabButtons = tabs.map((tab) => ({ ...createMockElement(), dataset: { tab } }));
  const views = tabs.map((tab) => ({ ...createMockElement(`view-${tab}`), id: `view-${tab}` }));
  const checkboxes = [createMockElement(), createMockElement()].map((el) => ({ ...el, checked: false }));
  const querySelectorAll = (selector: string) => {
    if (selector === ".tab-bar button[data-tab]") return tabButtons;
    if (selector === ".view") return views;
    if (selector === 'input[type="checkbox"]') return checkboxes;
    return [];
  };

  const document = {
    documentElement: { dataset: {} },
    body: createMockElement("body"),
    createElement: () => {
      let text = "";
      return {
        set textContent(value: unknown) {
          text = String(value ?? "");
        },
        get innerHTML() {
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
    // Stubbed in #313 — the viewer now calls history.replaceState
    // inside updateTabRoute → switchTab to drive the hash-route surface.
    // The vm sandbox is otherwise zero-globals so the call would
    // throw ReferenceError. No-op is fine for the rendering tests.
    history: { replaceState: () => {}, pushState: () => {} },
    location: {
      hash: "",
      pathname: "/",
      search: "",
    },
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

  const scriptWithoutAutoStart = scriptMatch[1].replace(
    /\n\s*loadTab\('dashboard'\);\n\s*connectWs\(\);\n\s*startDashboardAutoRefresh\(\);\s*$/,
    "\n",
  );

  vm.createContext(sandbox);
  vm.runInContext(scriptWithoutAutoStart, sandbox);

  return { sandbox, getElement };
}

describe("viewer session rendering", () => {
  it("attaches the saved viewer bearer to API calls", async () => {
    const { sandbox } = loadViewerSandbox();
    const requests: Array<{ url: string; opts: { headers?: Record<string, string> } }> = [];
    sandbox.sessionStorage.setItem("agentmemory-viewer-token", "viewer-secret");
    sandbox.fetch = async (url: string, opts: { headers?: Record<string, string> }) => {
      requests.push({ url, opts });
      return { ok: true, json: async () => ({ ok: true }) };
    };

    await sandbox.apiGet("health");

    expect(requests).toHaveLength(1);
    expect(requests[0].opts.headers?.Authorization).toBe("Bearer viewer-secret");
  });

  it("shows where to find AGENTMEMORY_SECRET after a viewer auth failure", async () => {
    const { sandbox, getElement } = loadViewerSandbox();
    sandbox.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });

    await sandbox.apiGet("health");

    const prompt = getElement("viewer-auth");
    expect(prompt.classList.contains("open")).toBe(true);
    expect(prompt.innerHTML).toContain("AGENTMEMORY_SECRET");
    expect(prompt.innerHTML).toContain("unlock viewer API access");
    expect(prompt.innerHTML).not.toContain("fly logs");
    expect(prompt.innerHTML).not.toContain("/data/.hmac");
  });

  it("drops sessions without an id instead of throwing, and renders the rest", () => {
    const { sandbox, getElement } = loadViewerSandbox();
    sandbox.store.snapshot = { version: "1" };
    sandbox.store.counts = { sessions: 2, activeSessions: 2, memories: 0, latestMemories: 0 };
    sandbox.replaceBucket("session", [
      { status: "active", observationCount: 3, startedAt: "2026-05-13T12:00:00Z" },
      { id: "ses_ok", project: "/work/web-app", status: "active", observationCount: 2, startedAt: "2026-05-13T13:00:00Z" },
    ]);
    sandbox.store.loaded.session = true;
    expect(Object.keys(sandbox.store.entities.session)).toEqual(["ses_ok"]);

    expect(() => sandbox.renderDashboard()).not.toThrow();
    expect(getElement("view-dashboard").innerHTML).toContain("web-app");
  });

  it("renders sessions without a project, and switches tabs", () => {
    const { sandbox, getElement } = loadViewerSandbox();
    sandbox.store.snapshot = { version: "1" };
    sandbox.replaceBucket("session", [{ id: "ses_no_project_123456", status: "active", observationCount: 1, startedAt: "2026-05-13T12:00:00Z" }]);
    sandbox.store.loaded.session = true;

    expect(() => sandbox.renderSessions()).not.toThrow();
    expect(getElement("session-list").innerHTML).toContain("123456");

    const tabButtons = sandbox.document.querySelectorAll(".tab-bar button[data-tab]");
    expect(tabButtons.length).toBeGreaterThan(0);
    expect(() => sandbox.switchTab("sessions")).not.toThrow();
    expect(tabButtons.some((button: any) => button.classList.contains("active"))).toBe(true);
  });
});
