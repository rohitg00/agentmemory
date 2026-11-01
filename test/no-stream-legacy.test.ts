import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

describe("removed stream/pubsub guard", () => {
  it("keeps application source free of the deprecated stream transport", () => {
    const root = import.meta.dirname + "/..";
    const files = sourceFiles(join(root, "src"));
    const forbidden = [
      /stream::/,
      /STREAM\./,
      /\/stream\/mem-live/,
      /III_STREAM_PORT/,
      /streamsPort/,
      /new WebSocket/,
      /wsPort/,
      /iii-stream/,
      /iii-pubsub/,
    ];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        expect(text, `${file} retained ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
