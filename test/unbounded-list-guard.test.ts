import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "../src");
const UNBOUNDED = "(insights|semantic|procedural|graphNodes|graphEdges|memories|audit|relations|auditMonth)";
const callRe = new RegExp(
  "\\w+\\.list(?:<[^>]*>)?\\(\\s*KV\\." + UNBOUNDED + "(\\b|\\()",
);

const ALLOWLIST: Record<string, string> = {
};

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (entry.endsWith(".ts")) yield full;
  }
}

describe("unbounded scope reads stay paged", () => {
  it("no .list() call targets a scope that can exceed the transport limit", () => {
    const hits: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, "utf8");
      const rel = file.slice(SRC.length + 1);
      for (const match of text.matchAll(new RegExp(callRe.source, "g"))) {
        const line = text.slice(0, match.index).split("\n").length;
        const key = `${rel}:${line}`;
        if (!ALLOWLIST[key]) hits.push(`${key} -> ${match[0].replace(/\s+/g, " ")}`);
      }
    }
    expect(hits, `unbounded .list() calls found:\n${hits.join("\n")}`).toEqual([]);
  });
});
