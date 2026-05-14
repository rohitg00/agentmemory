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
  const getElement = (id: string) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        innerHTML: "",
        textContent: "",
        value: "",
        dataset: {},
        style: {},
        classList: { toggle: () => {} },
        addEventListener: () => {},
        getAttribute: () => null,
        setAttribute: () => {},
      });
    }
    return elements.get(id);
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
          return htmlEscape(text);
        },
      };
    },
    getElementById: getElement,
    querySelectorAll: () => [],
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
    localStorage: { getItem: () => null, setItem: () => {} },
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
  it("does not throw when dashboard sessions are missing ids", () => {
    const { sandbox, getElement } = loadViewerSandbox();
    sandbox.state.dashboard = {
      loaded: true,
      health: { status: "healthy", health: {} },
      sessions: [{ status: "active", observationCount: 3, startedAt: "2026-05-13T12:00:00Z" }],
      memories: [],
      graphStats: null,
      recentAudit: [],
      lessons: [],
      crystals: [],
    };

    expect(() => sandbox.renderDashboard()).not.toThrow();
    expect(getElement("view-dashboard").innerHTML).toContain("Unknown session");
  });

  it("does not throw when timeline and sessions tabs receive sessions missing ids", () => {
    const { sandbox, getElement } = loadViewerSandbox();
    const sessions = [{ status: "active", observationCount: 1, startedAt: "2026-05-13T12:00:00Z" }];

    expect(() => sandbox.renderTimelineToolbar(sessions)).not.toThrow();
    expect(getElement("view-timeline").innerHTML).toContain("Unknown session");

    sandbox.state.sessions.items = sessions;
    expect(() => sandbox.renderSessions()).not.toThrow();
    expect(getElement("view-sessions").innerHTML).toContain("Unknown session");
  });
});
