import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const readFileSyncCalls: unknown[][] = [];

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: (...args: unknown[]) => {
      readFileSyncCalls.push(args);
      return (actual.readFileSync as (...a: unknown[]) => unknown)(...args);
    },
  };
});

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

describe("hydrateProcessEnvFromFile", () => {
  const TOUCHED = ["HYDRATE_ONLY", "HYDRATE_WINS"];

  beforeEach(() => {
    sandboxHome = mkdtempSync(join(tmpdir(), "agentmemory-hydrate-"));
    process.env["HOME"] = sandboxHome;
    process.env["USERPROFILE"] = sandboxHome;
    for (const k of TOUCHED) delete process.env[k];
  });

  afterEach(() => {
    if (ORIGINAL_HOME === undefined) delete process.env["HOME"];
    else process.env["HOME"] = ORIGINAL_HOME;
    if (ORIGINAL_USERPROFILE === undefined) delete process.env["USERPROFILE"];
    else process.env["USERPROFILE"] = ORIGINAL_USERPROFILE;
    for (const k of TOUCHED) delete process.env[k];
    rmSync(sandboxHome, { recursive: true, force: true });
  });

  it("copies .env-only keys into process.env", async () => {
    writeEnv("HYDRATE_ONLY=from-file");
    const cfg = await freshConfig();
    expect(process.env["HYDRATE_ONLY"]).toBeUndefined();
    cfg.hydrateProcessEnvFromFile();
    expect(process.env["HYDRATE_ONLY"]).toBe("from-file");
  });

  it("does not overwrite a value already set in process.env", async () => {
    writeEnv("HYDRATE_WINS=from-file");
    process.env["HYDRATE_WINS"] = "from-process";
    const cfg = await freshConfig();
    cfg.hydrateProcessEnvFromFile();
    expect(process.env["HYDRATE_WINS"]).toBe("from-process");
  });

  it("exposes a .env-only key via getEnvVar and, after hydrate, via raw process.env", async () => {
    writeEnv("HYDRATE_ONLY=from-file");
    const cfg = await freshConfig();
    expect(cfg.getEnvVar("HYDRATE_ONLY")).toBe("from-file");
    expect(process.env["HYDRATE_ONLY"]).toBeUndefined();
    cfg.hydrateProcessEnvFromFile();
    expect(process.env["HYDRATE_ONLY"]).toBe("from-file");
  });
});

describe("loadEnvFile cache", () => {
  beforeEach(() => {
    sandboxHome = mkdtempSync(join(tmpdir(), "agentmemory-cache-"));
    process.env["HOME"] = sandboxHome;
    process.env["USERPROFILE"] = sandboxHome;
    delete process.env["CACHED_VAR"];
    readFileSyncCalls.length = 0;
  });

  afterEach(() => {
    if (ORIGINAL_HOME === undefined) delete process.env["HOME"];
    else process.env["HOME"] = ORIGINAL_HOME;
    if (ORIGINAL_USERPROFILE === undefined) delete process.env["USERPROFILE"];
    else process.env["USERPROFILE"] = ORIGINAL_USERPROFILE;
    delete process.env["CACHED_VAR"];
    rmSync(sandboxHome, { recursive: true, force: true });
  });

  it("reads the .env file from disk only once across many getMergedEnv/getEnvVar calls", async () => {
    writeEnv("CACHED_VAR=cached");
    const cfg = await freshConfig();
    const envPath = join(sandboxHome, ".agentmemory", ".env");
    readFileSyncCalls.length = 0;

    for (let i = 0; i < 25; i++) {
      cfg.getEnvVar("CACHED_VAR");
      cfg.loadEmbeddingConfig();
      cfg.isConsolidationEnabled();
    }

    const envReads = readFileSyncCalls.filter(([p]) => p === envPath);
    expect(envReads).toHaveLength(1);
    expect(cfg.getEnvVar("CACHED_VAR")).toBe("cached");
  });

  it("sees updated .env content after vi.resetModules reloads the module", async () => {
    writeEnv("CACHED_VAR=first");
    const first = await freshConfig();
    expect(first.getEnvVar("CACHED_VAR")).toBe("first");

    writeEnv("CACHED_VAR=second");
    const second = await freshConfig();
    expect(second.getEnvVar("CACHED_VAR")).toBe("second");
  });

  it("re-reads disk after __resetEnvFileCache within the same module instance", async () => {
    writeEnv("CACHED_VAR=first");
    const cfg = await freshConfig();
    expect(cfg.getEnvVar("CACHED_VAR")).toBe("first");

    writeEnv("CACHED_VAR=second");
    expect(cfg.getEnvVar("CACHED_VAR")).toBe("first");

    cfg.__resetEnvFileCache();
    expect(cfg.getEnvVar("CACHED_VAR")).toBe("second");
  });
});
