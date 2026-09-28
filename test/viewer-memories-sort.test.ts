import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("viewer lists sort newest first (#674)", () => {
  const viewer = readFileSync("src/viewer/index.html", "utf-8");

  function extractFunction(name: string): string {
    const start = viewer.indexOf(`function ${name}(`);
    let depth = 0;
    for (let i = viewer.indexOf("{", start); i < viewer.length; i++) {
      if (viewer[i] === "{") depth++;
      if (viewer[i] === "}") {
        depth--;
        if (depth === 0) return viewer.slice(start, i + 1);
      }
    }
    throw new Error(`function ${name} is not balanced`);
  }

  const sortByTimeDesc = new Function(`${extractFunction("sortByTimeDesc")}\nreturn sortByTimeDesc;`)() as (
    list: Array<Record<string, string>>,
    keys: string[],
  ) => Array<Record<string, string>>;

  it("sorts on the first present key, newest first", () => {
    const rows = [
      { id: "a", createdAt: "2026-01-01" },
      { id: "b", updatedAt: "2026-03-01", createdAt: "2025-01-01" },
      { id: "c", createdAt: "2026-02-01" },
    ];
    expect(sortByTimeDesc(rows, ["updatedAt", "createdAt"]).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("memories fall back from updatedAt to createdAt and sessions sort on startedAt", () => {
    expect(extractFunction("memoryRows")).toMatch(/sortByTimeDesc\([\s\S]*?\['updatedAt', 'createdAt'\]\)/);
    expect(extractFunction("sessionRows")).toMatch(/sortByTimeDesc\(entityList\('session'\)[\s\S]*?\['startedAt'\]\)/);
  });
});
