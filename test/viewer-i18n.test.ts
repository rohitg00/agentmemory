import { describe, it, expect, afterEach } from "vitest";
import {
  resolveViewerLanguage,
  loadLocale,
  buildLocaleBundle,
} from "../src/viewer/locales.js";

describe("viewer i18n: language resolution", () => {
  const orig = process.env["VIEWER_LANGUAGE"];
  afterEach(() => {
    if (orig === undefined) delete process.env["VIEWER_LANGUAGE"];
    else process.env["VIEWER_LANGUAGE"] = orig;
  });

  it("defaults to en when VIEWER_LANGUAGE unset", () => {
    delete process.env["VIEWER_LANGUAGE"];
    expect(resolveViewerLanguage()).toBe("en");
  });

  it("defaults to en when VIEWER_LANGUAGE is empty/whitespace", () => {
    process.env["VIEWER_LANGUAGE"] = "   ";
    expect(resolveViewerLanguage()).toBe("en");
  });

  it("normalizes de-DE to de", () => {
    process.env["VIEWER_LANGUAGE"] = "de-DE";
    expect(resolveViewerLanguage()).toBe("de");
  });

  it("normalizes de_DE to de", () => {
    process.env["VIEWER_LANGUAGE"] = "de_DE";
    expect(resolveViewerLanguage()).toBe("de");
  });

  it("lowercases EN to en", () => {
    process.env["VIEWER_LANGUAGE"] = "EN";
    expect(resolveViewerLanguage()).toBe("en");
  });
});

describe("viewer i18n: locale loading", () => {
  it("returns {} for missing locale file without throwing", () => {
    expect(loadLocale("xx-not-real")).toEqual({});
  });

  it("loads en.json with nav, dashboard, memories top-level keys", () => {
    const en = loadLocale("en");
    expect(en["nav"]).toBeDefined();
    expect(en["dashboard"]).toBeDefined();
    expect(en["memories"]).toBeDefined();
  });
});

describe("viewer i18n: bundle building", () => {
  it("includes en fallback when requesting de", () => {
    const bundle = buildLocaleBundle("de");
    expect(bundle.lang).toBe("de");
    expect(bundle.fallback).toEqual(loadLocale("en"));
  });

  it("uses empty fallback when requesting en (no self-fallback)", () => {
    const bundle = buildLocaleBundle("en");
    expect(bundle.lang).toBe("en");
    expect(bundle.fallback).toEqual({});
  });
});
