import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const viewerSource = readFileSync("src/viewer/index.html", "utf-8");

function extractFunction(name: string): string {
  const asyncStart = viewerSource.indexOf(`async function ${name}(`);
  const start =
    asyncStart >= 0 ? asyncStart : viewerSource.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing viewer function: ${name}`);

  const bodyStart = viewerSource.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < viewerSource.length; index++) {
    if (viewerSource[index] === "{") depth++;
    if (viewerSource[index] === "}") depth--;
    if (depth === 0) return viewerSource.slice(start, index + 1);
  }

  throw new Error(`Unterminated viewer function: ${name}`);
}

async function renderDashboardWithMemoryResponse(memoryResponse: {
  memories: Array<{ id: string }>;
  total?: number;
}): Promise<string> {
  const dashboardElement = { innerHTML: "" };
  const state = {
    dashboard: {
      loaded: false,
      health: null,
      sessions: [],
      memories: [],
      graphStats: null,
      recentAudit: [],
      semantic: [],
      procedural: [],
      lessons: [],
      crystals: [],
      relations: [],
    },
  };
  const emptyResponses: Record<string, unknown> = {
    sessions: { sessions: [{ status: "completed", observationCount: 0 }] },
    "graph/stats": {},
    "audit?limit=5": { entries: [] },
    semantic: { facts: [] },
    procedural: { procedures: [] },
    relations: { relations: [] },
    lessons: { lessons: [] },
    crystals: { crystals: [] },
  };
  const context = {
    state,
    document: {
      getElementById: () => dashboardElement,
    },
    window: { location: { search: "" } },
    URLSearchParams,
    OP_BADGES: {},
    api: async () => ({ status: "healthy", health: {} }),
    apiGet: async (path: string) =>
      path === "memories?latest=true&limit=500"
        ? memoryResponse
        : emptyResponses[path],
    esc: (value: unknown) => String(value ?? ""),
    sessionDisplayName: () => "session",
    shortTime: () => "",
    humanizeHealthFlag: (value: unknown) => value,
    formatTime: () => "",
    truncate: (value: unknown) => String(value ?? ""),
    console,
  };

  vm.runInNewContext(
    `${extractFunction("renderDashboard")}\n${extractFunction("loadDashboard")}\nthis.loadDashboard = loadDashboard;`,
    context,
  );
  await (context as typeof context & { loadDashboard: () => Promise<void> })
    .loadDashboard();

  return dashboardElement.innerHTML;
}

describe("viewer dashboard memory total (#1279)", () => {
  it("renders the API total when the memory page is capped", async () => {
    const memories = Array.from({ length: 500 }, (_, index) => ({
      id: `memory-${index}`,
    }));

    const html = await renderDashboardWithMemoryResponse({
      memories,
      total: 610,
    });

    expect(html).toContain(
      '<div class="label">Memories</div><div class="value">610</div>',
    );
  });

  it("falls back to the loaded page length for older API responses", async () => {
    const memories = Array.from({ length: 3 }, (_, index) => ({
      id: `memory-${index}`,
    }));

    const html = await renderDashboardWithMemoryResponse({ memories });

    expect(html).toContain(
      '<div class="label">Memories</div><div class="value">3</div>',
    );
  });
});
