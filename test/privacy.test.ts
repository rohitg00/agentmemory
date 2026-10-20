import { describe, it, expect } from "vitest";
import { scrubRecord, stripPrivateData } from "../src/functions/privacy.js";

describe("stripPrivateData", () => {
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

  it.each([
    "task-runner-that-does-something-long",
    "bookmark-this-long-reference-identifier",
    "break-this-long-background-operation",
    "task-proj-abcdefghijklmnopqrstuvwxyz",
    "task-ant-abcdefghijklmnopqrstuvwxyz",
    "prefix_pk-abcdefghijklmnopqrstuvwxyz",
    "42rk-abcdefghijklmnopqrstuvwxyz",
    "éak-abcdefghijklmnopqrstuvwxyz",
    "漢sk-abcdefghijklmnopqrstuvwxyz",
    "e\u0301sk-abcdefghijklmnopqrstuvwxyz",
  ])("preserves key-like suffixes inside identifiers: %s", (identifier) => {
    expect(stripPrivateData(identifier)).toBe(identifier);
  });

  it.each(["sk", "pk", "rk", "ak", "sk-proj", "sk-ant"])(
    "still redacts standalone %s keys at punctuation and whitespace boundaries",
    (prefix) => {
      const key = `${prefix}-abcdefghijklmnopqrstuvwxyz`;
      for (const [before, after] of [["", ""], ["'", "'"], ['"', '"'], ["(", ")"], ["/", "."], ["\n", "\t"], ["🔑", "!"]]) {
        expect(stripPrivateData(`${before}${key}${after}`)).toBe(`${before}[REDACTED_SECRET]${after}`);
      }
    },
  );

  it("preserves identifiers while redacting adjacent keys on repeated passes", () => {
    const input = '{"task":"task-runner-that-does-something-long","key":"sk-abcdefghijklmnopqrstuvwxyz"}';
    const expected = '{"task":"task-runner-that-does-something-long","key":"[REDACTED_SECRET]"}';
    expect(stripPrivateData(input)).toBe(expected);
    expect(stripPrivateData(input)).toBe(expected);
    expect(stripPrivateData(expected)).toBe(expected);
  });
});

describe("scrubRecord property names", () => {
  const secret = "sk-abcdefghijklmnopqrstuvwxyz";

  it("leaves property names unchanged by default", () => {
    expect(scrubRecord({ [secret]: secret })).toEqual({ [secret]: "[REDACTED_SECRET]" });
  });

  it("optionally scrubs property names recursively without changing the input", () => {
    const input = { nested: [{ [secret]: { note: secret, count: 3, ok: true, empty: null } }] };
    const before = structuredClone(input);
    expect(scrubRecord(input, { scrubKeys: true })).toEqual({
      nested: [{ "[REDACTED_SECRET]": { note: "[REDACTED_SECRET]", count: 3, ok: true, empty: null } }],
    });
    expect(input).toEqual(before);
  });

  it.each([false, true])("preserves own __proto__ fields with scrubKeys=%s", (scrubKeys) => {
    const input = { ["__proto__"]: { note: secret }, constructor: "ordinary value" };
    const output = scrubRecord(input, { scrubKeys });
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
    expect(Object.hasOwn(output, "__proto__")).toBe(true);
    expect(output).toEqual({ ["__proto__"]: { note: "[REDACTED_SECRET]" }, constructor: "ordinary value" });
    expect(input["__proto__"].note).toBe(secret);
  });

  it("preserves both values when scrubbed property names collide", () => {
    expect(scrubRecord({ [secret]: "first", "[REDACTED_SECRET]": "last" }, { scrubKeys: true }))
      .toEqual({ "[REDACTED_SECRET]": "first", "[REDACTED_SECRET]_2": "last" });
  });

  it("avoids existing names when allocating collision suffixes", () => {
    const input = { [secret]: "first", "pk-abcdefghijklmnopqrstuvwxyz": "second", "[REDACTED_SECRET]_2": "ordinary" };
    const output = scrubRecord(input, { scrubKeys: true });
    expect(output).toEqual({ "[REDACTED_SECRET]": "first", "[REDACTED_SECRET]_3": "second", "[REDACTED_SECRET]_2": "ordinary" });
    expect(scrubRecord(output, { scrubKeys: true })).toEqual(output);
  });
});
