import { describe, it, expect } from "vitest";
import { stripPrivateData } from "../src/functions/privacy.js";

describe("stripPrivateData", () => {
  it.each([
    "task-runner-that-does-something-long",
    "risk-report-generator-version-2026",
    "prefix-sk-1234567890abcdefghijklmnopqr",
    "prefix_pk-1234567890abcdefghijklmnopqr",
    "work-rk-1234567890abcdefghijklmnopqr",
    "break-1234567890abcdefghijklmnopqr",
  ])("preserves compound words containing a generic key prefix: %s", (input) => {
    expect(stripPrivateData(input)).toBe(input);
  });

  it.each(["sk", "pk", "rk", "ak"])("redacts standalone %s keys at punctuation boundaries", (prefix) => {
    const key = `${prefix}-1234567890abcdefghijklmnopqr`;
    expect(stripPrivateData(key)).toBe("[REDACTED_SECRET]");
    expect(stripPrivateData(`value='${key}' (${key}) /${key}`)).toBe(
      "value='[REDACTED_SECRET]' ([REDACTED_SECRET]) /[REDACTED_SECRET]",
    );
  });

  it("preserves ordinary text while redacting a separate real key", () => {
    expect(stripPrivateData("task-runner-that-does-something-long sk-1234567890abcdefghijklmnopqr")).toBe(
      "task-runner-that-does-something-long [REDACTED_SECRET]",
    );
  });

  it("strips private tags", () => {
    expect(stripPrivateData("hello <private>secret</private> world")).toBe(
      "hello [REDACTED] world",
    );
  });

  it("strips private tags case-insensitive", () => {
    expect(stripPrivateData("<Private>data</Private>")).toBe("[REDACTED]");
  });

  it("strips API keys", () => {
    expect(stripPrivateData("api_key=sk-ant-1234567890abcdefghij")).toBe(
      "[REDACTED_SECRET]",
    );
  });

  it("strips GitHub PATs", () => {
    expect(
      stripPrivateData("token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh"),
    ).toBe("[REDACTED_SECRET]");
  });

  it("strips standalone GitHub PATs", () => {
    expect(
      stripPrivateData("found ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij here"),
    ).toBe("found [REDACTED_SECRET] here");
  });

  it("strips Slack tokens", () => {
    expect(stripPrivateData("xoxb-123456-789012-abcdef")).toBe(
      "[REDACTED_SECRET]",
    );
  });

  it("strips AWS access keys", () => {
    expect(stripPrivateData("key=AKIAIOSFODNN7EXAMPLE")).toBe(
      "key=[REDACTED_SECRET]",
    );
  });

  it("strips JWT tokens", () => {
    expect(
      stripPrivateData(
        "eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpM",
      ),
    ).toBe("[REDACTED_SECRET]");
  });

  it("strips sk- prefixed keys", () => {
    expect(stripPrivateData("sk-1234567890abcdefghijklmnopqr")).toBe(
      "[REDACTED_SECRET]",
    );
  });

  it("strips OpenAI project keys", () => {
    expect(
      stripPrivateData("sk-proj-1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJ"),
    ).toBe("[REDACTED_SECRET]");
  });

  it("strips GitHub fine-grained service tokens", () => {
    expect(
      stripPrivateData("ghs_1234567890abcdefghijklmnopqrstuvwxyzAB"),
    ).toBe("[REDACTED_SECRET]");
  });

  it("strips bearer tokens", () => {
    expect(
      stripPrivateData(
        "Authorization: Bearer sk-proj-1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJ",
      ),
    ).toBe("Authorization: [REDACTED_SECRET]");
  });

  it("handles multiple secrets in one string", () => {
    const input =
      "sk-abcdefghijklmnopqrstuv and ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";
    const result = stripPrivateData(input);
    expect(result).not.toContain("sk-");
    expect(result).not.toContain("ghp_");
  });

  it("does not strip short strings", () => {
    expect(stripPrivateData("api_key=short")).toBe("api_key=short");
  });

  it("returns empty string unchanged", () => {
    expect(stripPrivateData("")).toBe("");
  });

  it("handles no secrets gracefully", () => {
    expect(stripPrivateData("normal text without secrets")).toBe(
      "normal text without secrets",
    );
  });

  it("works correctly on consecutive calls (no regex statefulness)", () => {
    const input = "sk-ABCDEFGHIJKLMNOPQRSTUVWXYZabc";
    expect(stripPrivateData(input)).toBe("[REDACTED_SECRET]");
    expect(stripPrivateData(input)).toBe("[REDACTED_SECRET]");
    expect(stripPrivateData(input)).toBe("[REDACTED_SECRET]");
  });
});
