import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("foreground CLI startup for managed Compose", () => {
  it("exits after publishing ready state while the detached Compose daemon owns service lifetime", () => {
    const source = readFileSync(new URL("../src/cli.ts", import.meta.url), "utf8");
    const ready = source.indexOf("printReadyHint();", source.indexOf("async function main()"));
    const composeExit = source.indexOf('if (managedCompose?.kind === "compose")', ready);
    expect(ready).toBeGreaterThan(-1);
    expect(composeExit).toBeGreaterThan(ready);
    expect(source.slice(composeExit, composeExit + 450)).toContain("process.exit(0)");
  });
});
