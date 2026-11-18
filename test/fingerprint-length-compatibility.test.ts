import { describe, expect, it } from "vitest";
import { fingerprintId } from "../src/state/fingerprint.js";
import { fingerprintId as legacyExport } from "../src/state/schema.js";

const cases = [
  {
    "prefix": "mem",
    "content": "hello",
    "legacy_default16": "mem_2cf24dba5fb0a30e",
    "full64": "mem_2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
  },
  {
    "prefix": "x",
    "content": "",
    "legacy_default16": "x_e3b0c44298fc1c14",
    "full64": "x_e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  },
  {
    "prefix": "gh",
    "content": "[\"github-issues-v1\",\"123\",\"456\",\"2026-11-10T12:00:00Z\",\"Choose stable project identity\",\"Keep review decisions with the checkout's project.\",\"open\"]",
    "legacy_default16": "gh_de4f949794228efe",
    "full64": "gh_de4f949794228efe9acaffea7949d7511e455735dfe9ee361c0025297bb0e68c"
  },
  {
    "prefix": "gh",
    "content": "decision\u0000boundary",
    "legacy_default16": "gh_552b23a5f110f940",
    "full64": "gh_552b23a5f110f940c1c41cbb5204f855c60776d084bae382560a40b49da93788"
  },
  {
    "prefix": "gh",
    "content": "Привет 世界",
    "legacy_default16": "gh_a27e0f1c2d705010",
    "full64": "gh_a27e0f1c2d705010b0a7bcf180eec6e4ca1ec363d1356f5403d551eba70508ba"
  }
];

describe("shared fingerprints preserve legacy and GitHub revision identities", () => {
  for (const [index, value] of cases.entries()) {
    it(`preserves literal default16 and explicit full64 golden ${index + 1}`, () => {
      expect(fingerprintId(value.prefix, value.content)).toBe(value.legacy_default16);
      expect(fingerprintId(value.prefix, value.content, 16)).toBe(value.legacy_default16);
      expect(legacyExport(value.prefix, value.content)).toBe(value.legacy_default16);
      expect(fingerprintId(value.prefix, value.content, 64)).toBe(value.full64);
    });
  }

  it("keeps the existing schema export bound to the shared helper", () => {
    expect(legacyExport).toBe(fingerprintId);
  });

  for (const length of [0, 32, 65, null]) {
    it(`refuses unsupported fingerprint length ${length}`, () => {
      expect(() => Reflect.apply(fingerprintId, undefined, ["mem", "hello", length])).toThrow(RangeError);
    });
  }
});
