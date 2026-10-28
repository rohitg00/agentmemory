import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewer = readFileSync("src/viewer/index.html", "utf8");

function extract(name: string): string {
  const start = viewer.indexOf(`    function ${name}(`);
  const end = viewer.indexOf("\n    function ", start + 1);
  if (start < 0 || end < 0) throw new Error(`Missing viewer function: ${name}`);
  return viewer.slice(start, end);
}

const { row, workers } = new Function(
  `${extract("esc")}\n${extract("workerRowHtml")}\n${extract("workersHtml")}
   function help() { return ''; }
   return { row: workerRowHtml, workers: workersHtml };`,
)();

describe("viewer runtime workers", () => {
  it.each(["connected", "running"])("shows %s workers as healthy", (status) => {
    expect(row({ name: "agentmemory", status })).toContain('worker-dot running');
    expect(row({ name: "agentmemory", status })).toContain('badge-green');
  });

  it.each(["available", "future-state", undefined])("does not mark %s as failed", (status) => {
    const html = row({ id: "worker-1", status });
    expect(html).toContain("worker-1");
    expect(html).toContain(status || "unknown");
    expect(html).not.toContain("stopped");
    expect(html).not.toContain("badge-red");
  });

  it.each(["failed", "error", "disconnected", "stopped"])("keeps %s visible as a problem", (status) => {
    expect(row({ name: "state", status })).toContain('worker-dot stopped');
    expect(row({ name: "state", status })).toContain('badge-red');
  });

  it("groups engine services by runtime metadata, preserving application and legacy workers", () => {
    const html = workers([
      { name: "agentmemory", status: "connected" },
      { name: "iii-custom-app", status: "running" },
      { name: "compose", status: "connected" },
      { name: "configuration", runtime: "engine", status: "available" },
      { name: "custom-internal", isolation: "in-process", status: "available" },
    ]);
    const [primary, details] = html.split("<details");
    expect(primary).toContain("agentmemory");
    expect(primary).toContain("iii-custom-app");
    expect(primary).not.toContain("configuration");
    expect(details).toContain("Engine details (3)");
    expect(details).toContain("compose");
    expect(details).toContain("custom-internal");
    expect(details).not.toMatch(/^[^>]*\sopen(?:\s|>)/);
    expect(workers([{ name: "compose", status: "connected" }], true)).toContain('id="health-engine-details" open');
    expect(details).toContain("does not indicate whether an optional feature");
    expect(workers([])).toBe("");
  });

  it("escapes worker names and unknown status strings", () => {
    const html = row({ name: '<img src=x onerror="alert(1)">', status: '<script>alert(1)</script>' });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;script");
  });
});
