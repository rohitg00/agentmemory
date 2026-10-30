import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("isSlotsEnabled — reads merged env", () => {
  let home: string;
  let ORIG_HOME: string | undefined;
  let ORIG_FLAG: string | undefined;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "am-slots-flag-"));
    mkdirSync(join(home, ".agentmemory"), { recursive: true });
    ORIG_HOME = process.env["HOME"];
    ORIG_FLAG = process.env["AGENTMEMORY_SLOTS"];
    process.env["HOME"] = home;
    delete process.env["AGENTMEMORY_SLOTS"];
    vi.resetModules();
  });

  afterEach(() => {
    if (ORIG_HOME !== undefined) process.env["HOME"] = ORIG_HOME;
    if (ORIG_FLAG !== undefined) process.env["AGENTMEMORY_SLOTS"] = ORIG_FLAG;
    else delete process.env["AGENTMEMORY_SLOTS"];
    rmSync(home, { recursive: true, force: true });
  });

  it("returns false when neither process.env nor .env sets the flag", async () => {
    const { isSlotsEnabled } = await import("../src/functions/slots.js");
    expect(isSlotsEnabled()).toBe(false);
  });

  it("returns true when AGENTMEMORY_SLOTS=true lives only in ~/.agentmemory/.env", async () => {
    writeFileSync(
      join(home, ".agentmemory", ".env"),
      "AGENTMEMORY_SLOTS=true\n",
    );
    const { isSlotsEnabled } = await import("../src/functions/slots.js");
    expect(isSlotsEnabled()).toBe(true);
  });

  it("returns true when process.env wins over .env (existing behaviour preserved)", async () => {
    writeFileSync(
      join(home, ".agentmemory", ".env"),
      "AGENTMEMORY_SLOTS=false\n",
    );
    process.env["AGENTMEMORY_SLOTS"] = "true";
    const { isSlotsEnabled } = await import("../src/functions/slots.js");
    expect(isSlotsEnabled()).toBe(true);
  });
});

describe("isReflectEnabled — reads merged env", () => {
  let home: string;
  let ORIG_HOME: string | undefined;
  let ORIG_FLAG: string | undefined;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "am-reflect-flag-"));
    mkdirSync(join(home, ".agentmemory"), { recursive: true });
    ORIG_HOME = process.env["HOME"];
    ORIG_FLAG = process.env["AGENTMEMORY_REFLECT"];
    process.env["HOME"] = home;
    delete process.env["AGENTMEMORY_REFLECT"];
    vi.resetModules();
  });

  afterEach(() => {
    if (ORIG_HOME !== undefined) process.env["HOME"] = ORIG_HOME;
    if (ORIG_FLAG !== undefined) process.env["AGENTMEMORY_REFLECT"] = ORIG_FLAG;
    else delete process.env["AGENTMEMORY_REFLECT"];
    rmSync(home, { recursive: true, force: true });
  });

  it("returns true when AGENTMEMORY_REFLECT=true is only in ~/.agentmemory/.env", async () => {
    writeFileSync(
      join(home, ".agentmemory", ".env"),
      "AGENTMEMORY_REFLECT=true\n",
    );
    const { isReflectEnabled } = await import("../src/functions/slots.js");
    expect(isReflectEnabled()).toBe(true);
  });
});
