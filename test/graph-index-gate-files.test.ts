import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

const script = readFileSync(new URL("../scripts/release-gate/graph-index.mjs", import.meta.url), "utf8");
const start = script.indexOf("function graphFiles(p) {");
const end = script.indexOf("\nfunction ordinaryReads(", start);

function graphFiles(files: string[], stat: (path: string) => { size: number }) {
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return runInNewContext(`(${script.slice(start, end)})`, {
    join,
    readdirSync: () => files,
    statSync: stat,
  })({ data: "/fixture" });
}

describe("packaged graph gate file diagnostics", () => {
  it("ignores a temporary graph file removed by an atomic rename", () => {
    const stat = vi.fn((path: string) => {
      if (path.endsWith(".tmp")) throw Object.assign(new Error("file renamed"), { code: "ENOENT" });
      return { size: 128 };
    });
    expect(graphFiles([
      "mem%3Agraph%3Aretrieval-data.bin",
      "mem%3Agraph%3Aretrieval-data.bin.tmp",
      "mem%3Amemories.bin",
    ], stat)).toEqual([{ scope: "mem:graph:retrieval-data", bytes: 128 }]);
    expect(stat).toHaveBeenCalledOnce();
  });

  it("still reports stat failures for committed graph files", () => {
    const error = Object.assign(new Error("permission denied"), { code: "EACCES" });
    expect(() => graphFiles(["mem%3Agraph%3Aretrieval-data.bin"], () => { throw error; })).toThrow(error);
  });
});
