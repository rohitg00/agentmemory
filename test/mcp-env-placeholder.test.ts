import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { resolveEnvOrEmpty } from "../src/mcp/rest-proxy.js";

const VAR = "AGENTMEMORY_TEST_URL";

describe("resolveEnvOrEmpty — guards against literal ${VAR} placeholders", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[VAR];
    delete process.env[VAR];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[VAR];
    else process.env[VAR] = original;
  });

  it("returns '' when env var is unset", () => {
    expect(resolveEnvOrEmpty(VAR)).toBe("");
  });

  it("returns '' when env var is empty string", () => {
    process.env[VAR] = "";
    expect(resolveEnvOrEmpty(VAR)).toBe("");
  });

  it("returns '' when env var is literal ${VAR} placeholder", () => {
    process.env[VAR] = "${AGENTMEMORY_TEST_URL}";
    expect(resolveEnvOrEmpty(VAR)).toBe("");
  });

  it("returns '' when env var is a different literal placeholder", () => {
    process.env[VAR] = "${SOME_OTHER_VAR}";
    expect(resolveEnvOrEmpty(VAR)).toBe("");
  });

  it("preserves a real URL value", () => {
    process.env[VAR] = "https://memory.prod.example/api";
    expect(resolveEnvOrEmpty(VAR)).toBe("https://memory.prod.example/api");
  });

  it("preserves a real secret value that happens to contain a $ char", () => {
    process.env[VAR] = "secret-with-$dollar";
    expect(resolveEnvOrEmpty(VAR)).toBe("secret-with-$dollar");
  });

  it("does not treat ${ at start without matching } as placeholder", () => {
    process.env[VAR] = "${unclosed";
    expect(resolveEnvOrEmpty(VAR)).toBe("${unclosed");
  });

  it("does not treat $VAR (no braces) as placeholder", () => {
    process.env[VAR] = "$AGENTMEMORY_URL";
    expect(resolveEnvOrEmpty(VAR)).toBe("$AGENTMEMORY_URL");
  });
});
