import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSystemdCredentials } from "../src/load-credentials.js";

describe("loadSystemdCredentials", () => {
  let dir: string;
  const savedEnv = { ...process.env };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agentmemory-creds-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    // Restore process.env to its pre-test shape.
    for (const k of Object.keys(process.env)) {
      if (!(k in savedEnv)) delete process.env[k];
    }
    Object.assign(process.env, savedEnv);
    delete process.env["CREDENTIALS_DIRECTORY"];
  });

  it("populates process.env from credential files and trims a trailing newline", () => {
    writeFileSync(join(dir, "ANTHROPIC_API_KEY"), "sk-ant-test\n");
    writeFileSync(join(dir, "AGENTMEMORY_SECRET"), "bearer-xyz");
    delete process.env["ANTHROPIC_API_KEY"];
    delete process.env["AGENTMEMORY_SECRET"];
    process.env["CREDENTIALS_DIRECTORY"] = dir;

    loadSystemdCredentials();

    expect(process.env["ANTHROPIC_API_KEY"]).toBe("sk-ant-test");
    expect(process.env["AGENTMEMORY_SECRET"]).toBe("bearer-xyz");
  });

  it("never overwrites an explicitly set, non-empty environment variable", () => {
    writeFileSync(join(dir, "ANTHROPIC_API_KEY"), "from-credential");
    process.env["ANTHROPIC_API_KEY"] = "from-env";
    process.env["CREDENTIALS_DIRECTORY"] = dir;

    loadSystemdCredentials();

    expect(process.env["ANTHROPIC_API_KEY"]).toBe("from-env");
  });

  it("fills a variable that is present but empty", () => {
    writeFileSync(join(dir, "GEMINI_API_KEY"), "from-credential");
    process.env["GEMINI_API_KEY"] = "";
    process.env["CREDENTIALS_DIRECTORY"] = dir;

    loadSystemdCredentials();

    expect(process.env["GEMINI_API_KEY"]).toBe("from-credential");
  });

  it("is a no-op when CREDENTIALS_DIRECTORY is unset", () => {
    delete process.env["CREDENTIALS_DIRECTORY"];
    delete process.env["SOME_CRED_VAR"];

    expect(() => loadSystemdCredentials()).not.toThrow();
    expect(process.env["SOME_CRED_VAR"]).toBeUndefined();
  });

  it("is a no-op when CREDENTIALS_DIRECTORY points at a missing directory", () => {
    process.env["CREDENTIALS_DIRECTORY"] = join(dir, "does-not-exist");

    expect(() => loadSystemdCredentials()).not.toThrow();
  });

  it("ignores subdirectories and empty credential files", () => {
    mkdtempSync(join(dir, "subdir-"));
    writeFileSync(join(dir, "EMPTY_CRED"), "");
    delete process.env["EMPTY_CRED"];
    process.env["CREDENTIALS_DIRECTORY"] = dir;

    loadSystemdCredentials();

    expect(process.env["EMPTY_CRED"]).toBeUndefined();
  });
});
