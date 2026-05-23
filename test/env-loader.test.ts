import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORIGINAL_HOME = process.env["HOME"];
const ORIGINAL_USERPROFILE = process.env["USERPROFILE"];

let sandboxHome: string;

async function freshConfig() {
  vi.resetModules();
  return await import("../src/config.js");
}

function writeEnv(contents: string) {
  const dir = join(sandboxHome, ".agentmemory");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".env"), contents);
}

describe("loadEnvFile", () => {
  beforeEach(() => {
    sandboxHome = mkdtempSync(join(tmpdir(), "agentmemory-env-"));
    process.env["HOME"] = sandboxHome;
    process.env["USERPROFILE"] = sandboxHome;
    delete process.env["AGENTMEMORY_AUTO_COMPRESS"];
    delete process.env["AGENTMEMORY_DROP_STALE_INDEX"];
    delete process.env["CONSOLIDATION_ENABLED"];
    delete process.env["GRAPH_EXTRACTION_ENABLED"];
    delete process.env["TOKEN"];
    delete process.env["HASHVAL"];
  });

  afterEach(() => {
    if (ORIGINAL_HOME === undefined) delete process.env["HOME"];
    else process.env["HOME"] = ORIGINAL_HOME;
    if (ORIGINAL_USERPROFILE === undefined) delete process.env["USERPROFILE"];
    else process.env["USERPROFILE"] = ORIGINAL_USERPROFILE;
    rmSync(sandboxHome, { recursive: true, force: true });
  });

  it("strips trailing inline # comments on unquoted values", async () => {
    writeEnv(
      [
        "AGENTMEMORY_AUTO_COMPRESS=true   # opt in to LLM compression",
        "CONSOLIDATION_ENABLED=true       # daily summarization",
        "GRAPH_EXTRACTION_ENABLED=true    # entity graph",
      ].join("\n"),
    );
    const cfg = await freshConfig();
    expect(cfg.isAutoCompressEnabled()).toBe(true);
    expect(cfg.isConsolidationEnabled()).toBe(true);
    expect(cfg.isGraphExtractionEnabled()).toBe(true);
  });

  it("preserves # inside double-quoted values", async () => {
    writeEnv('TOKEN="abc#def"');
    const cfg = await freshConfig();
    expect(cfg.getEnvVar("TOKEN")).toBe("abc#def");
  });

  it("preserves # inside single-quoted values", async () => {
    writeEnv("TOKEN='abc#def'");
    const cfg = await freshConfig();
    expect(cfg.getEnvVar("TOKEN")).toBe("abc#def");
  });

  it("treats hash without leading space as part of value", async () => {
    writeEnv("HASHVAL=abc#def");
    const cfg = await freshConfig();
    expect(cfg.getEnvVar("HASHVAL")).toBe("abc#def");
  });

  it("strips inline comment after a quoted value and unwraps quotes", async () => {
    writeEnv('TOKEN="abc" # trailing comment');
    const cfg = await freshConfig();
    expect(cfg.getEnvVar("TOKEN")).toBe("abc");
  });

  it("strips inline comment after a single-quoted value and unwraps quotes", async () => {
    writeEnv("TOKEN='abc' # trailing comment");
    const cfg = await freshConfig();
    expect(cfg.getEnvVar("TOKEN")).toBe("abc");
  });

  it("reads AGENTMEMORY_DROP_STALE_INDEX from the env file", async () => {
    writeEnv("AGENTMEMORY_DROP_STALE_INDEX=true");
    const cfg = await freshConfig();
    expect(cfg.isDropStaleIndexEnabled()).toBe(true);
  });
});
