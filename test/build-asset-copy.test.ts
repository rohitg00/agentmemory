import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import config from "../tsdown.config.js";

// The build used to copy assets with a POSIX `cp` tail on the npm script,
// which npm runs through cmd.exe on Windows: the copies failed, dist/viewer
// was never created, and `npm run build` exited 1 after printing success.
// Assets now ride on tsdown's own `copy`, which these guard.

const ROOT = join(import.meta.dirname, "..");

type CopyEntry = { from: string; to: string };
type Block = { copy?: CopyEntry[]; outDir?: string; clean?: boolean };

const blocks = config as unknown as Block[];
const copyBlocks = blocks.filter((b) => Array.isArray(b.copy) && b.copy.length > 0);
const allCopies = copyBlocks.flatMap((b) => b.copy ?? []);

describe("build asset copying", () => {
  it("declares the copies on exactly one block", () => {
    // hookEntries.map() expands one block into 14. A `copy` on the mapped
    // block runs every copy 14x in parallel, and they race: EBUSY on Windows.
    expect(copyBlocks).toHaveLength(1);
  });

  it("ships every asset the published package lists", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
    const packagedRootAssets: string[] = pkg.files.filter((f: string) => !f.endsWith("/"));
    const copiedNames = allCopies.map((c) => c.from.split("/").pop());

    for (const asset of packagedRootAssets) {
      if (asset === "LICENSE" || asset === "README.md" || asset === "AGENTS.md") continue;
      expect(copiedNames).toContain(asset);
    }
  });

  it("puts the viewer files under dist/viewer", () => {
    const viewer = allCopies.filter((c) => c.from.startsWith("src/viewer/"));

    expect(viewer.map((c) => c.from.split("/").pop()).sort()).toEqual([
      "favicon.svg",
      "index.html",
    ]);
    for (const entry of viewer) expect(entry.to).toBe("dist/viewer");
  });

  it("copies every source that actually exists in the repo", () => {
    for (const entry of allCopies) {
      expect(() => readFileSync(join(ROOT, entry.from))).not.toThrow();
    }
  });

  it("keeps the build script free of POSIX shell utilities", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));

    // cmd.exe has no cp/mkdir -p; a reintroduced tail breaks Windows again.
    expect(pkg.scripts.build).not.toMatch(/\bcp\b|\bmkdir\b/);
  });

  it("cleans dist on the first block only", () => {
    // tsdown clears outDir per block, so a later clean would delete the
    // artifacts the earlier blocks just wrote.
    expect(blocks[0]?.clean).toBe(true);
    expect(blocks.slice(1).some((b) => b.clean === true)).toBe(false);
  });
});
