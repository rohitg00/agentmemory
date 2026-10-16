import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

async function capWarningsFor(
  value: string | undefined,
): Promise<string[]> {
  if (value === undefined) delete process.env["MAX_OBS_PER_SESSION"];
  else process.env["MAX_OBS_PER_SESSION"] = value;
  const writes: string[] = [];
  vi.spyOn(process.stderr, "write").mockImplementation(
    (chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    },
  );
  vi.resetModules();
  const { loadConfig } = await import("../src/config.js");
  loadConfig();
  loadConfig();
  return writes.filter((w) => w.includes("MAX_OBS_PER_SESSION"));
}

describe("MAX_OBS_PER_SESSION vs import ceiling boot warning", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env["MAX_OBS_PER_SESSION"];
  });

  afterEach(() => {
    if (saved === undefined) delete process.env["MAX_OBS_PER_SESSION"];
    else process.env["MAX_OBS_PER_SESSION"] = saved;
    vi.restoreAllMocks();
  });

  it("warns once when the runtime cap is raised past the import ceiling", async () => {
    const warnings = await capWarningsFor("5001");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("5001");
    expect(warnings[0]).toContain("5000");
    expect(warnings[0]).toContain("import");
  });

  it("warns when the runtime cap is uncapped (0)", async () => {
    const warnings = await capWarningsFor("0");
    expect(warnings).toHaveLength(1);
  });

  it("stays quiet at exactly the import ceiling", async () => {
    expect(await capWarningsFor("5000")).toHaveLength(0);
  });

  it("stays quiet for the default cap", async () => {
    expect(await capWarningsFor(undefined)).toHaveLength(0);
  });
});
