import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type ViewerElement = {
  innerHTML: string;
  textContent: string;
  value: string;
  dataset: Record<string, string>;
  classList: {
    toggle: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  querySelector: ReturnType<typeof vi.fn>;
  querySelectorAll: ReturnType<typeof vi.fn>;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function loadViewerScript(): string {
  const html = readFileSync(
    new URL("../src/viewer/index.html", import.meta.url),
    "utf8",
  );
  const match = html.match(
    /<script nonce="__AGENTMEMORY_VIEWER_NONCE__">([\s\S]*?)<\/script>/,
  );
  if (!match) throw new Error("viewer script not found");

  return match[1].replace(
    /(?:\s*(?:loadTab\('dashboard'\)|connectWs\(\)|startDashboardAutoRefresh\(\));)+\s*$/,
    "\n",
  );
}

function createViewerSandbox() {
  const elements = new Map<string, ViewerElement>();
  const getElement = (id: string) => {
    if (!elements.has(id)) {
      elements.set(id, {
        innerHTML: "",
        textContent: "",
        value: "",
        dataset: {},
        classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => []),
      });
    }
    return elements.get(id);
  };

  const sandbox: Record<string, unknown> = {
    console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    URLSearchParams,
    Date,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    Array,
    parseInt,
    setTimeout,
    clearTimeout,
    setInterval: vi.fn(() => 0),
    clearInterval: vi.fn(),
    fetch: vi.fn(),
    alert: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    localStorage: { getItem: vi.fn(() => null), setItem: vi.fn() },
    sessionStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
    WebSocket: vi.fn(),
    history: { replaceState: vi.fn(), pushState: vi.fn() },
    document: {
      documentElement: { dataset: {} },
      addEventListener: vi.fn(),
      querySelectorAll: vi.fn(() => []),
      getElementById: vi.fn(getElement),
      createElement: vi.fn(() => {
        const node: { innerHTML: string; value: string; textContent?: string } = {
          innerHTML: "",
          value: "",
        };
        Object.defineProperty(node, "textContent", {
          get: () => node.value,
          set(value: unknown) {
            node.value = String(value);
            node.innerHTML = escapeHtml(String(value));
          },
        });
        return node;
      }),
    },
  };

  sandbox.window = sandbox;
  sandbox.location = {
    search: "",
    hash: "",
    pathname: "/",
    protocol: "http:",
    hostname: "localhost",
    port: "3113",
    host: "localhost:3113",
    origin: "http://localhost:3113",
  };
  sandbox.matchMedia = vi.fn(() => ({ matches: false }));

  return { sandbox, elements };
}

describe("viewer dashboard", () => {
  it("renders partial dashboard payloads without crashing", () => {
    const { sandbox, elements } = createViewerSandbox();
    runInNewContext(loadViewerScript(), sandbox, { filename: "viewer.html" });

    const state = sandbox.state as { dashboard: unknown };
    state.dashboard = {
      loaded: true,
      health: {
        status: "healthy",
        health: {
          connectionState: "connected",
          alerts: { malformed: true },
          notes: "not-an-array",
        },
        functionMetrics: undefined,
      },
      sessions: [
        {
          status: "completed",
          observationCount: 2,
          startedAt: "2026-05-14T03:00:00.000Z",
        },
        null,
        {
          id: "ses_good",
          project: "C:/work/app",
          status: "active",
          observationCount: 1,
          startedAt: "2026-05-14T04:00:00.000Z",
        },
      ],
      memories: { malformed: true },
      graphStats: { nodes: 1, edges: 0 },
      recentAudit: undefined,
      lessons: undefined,
      crystals: undefined,
      semantic: { malformed: true },
      procedural: [
        { title: "Recovered procedure", steps: undefined },
        // A normalized container can still hold junk: null, a bare number, and
        // an object with none of the expected fields must all render.
        { title: "Ragged steps", steps: [null, "plain step", 42, { note: "no description" }] },
      ],
      relations: [{ type: "related" }],
    };

    expect(() => (sandbox.renderDashboard as () => void)()).not.toThrow();
    const dashboard = elements.get("view-dashboard");
    expect(dashboard?.innerHTML).toContain("Recent Sessions");
    expect(dashboard?.innerHTML).toContain("Unknown session");
    expect(dashboard?.innerHTML).toContain("Recovered procedure");
    expect(dashboard?.innerHTML).toContain("Ragged steps");
    expect(dashboard?.innerHTML).toContain("plain step");
  });
});
