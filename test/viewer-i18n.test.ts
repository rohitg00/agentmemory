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

import { renderViewerDocument } from "../src/viewer/document.js";

describe("viewer i18n: document injection", () => {
  const orig = process.env["VIEWER_LANGUAGE"];
  afterEach(() => {
    if (orig === undefined) delete process.env["VIEWER_LANGUAGE"];
    else process.env["VIEWER_LANGUAGE"] = orig;
  });

  it("injects lang and messages when VIEWER_LANGUAGE=de", () => {
    process.env["VIEWER_LANGUAGE"] = "de";
    const r = renderViewerDocument();
    expect(r.found).toBe(true);
    if (!r.found) return;
    expect(r.html).toContain('"lang":"de"');
    expect(r.html).toContain('"messages"');
    expect(r.html).toContain('"fallback"');
  });

  it("strips the __AGENTMEMORY_LOCALE__ placeholder completely", () => {
    process.env["VIEWER_LANGUAGE"] = "en";
    const r = renderViewerDocument();
    expect(r.found).toBe(true);
    if (!r.found) return;
    expect(r.html).not.toContain("__AGENTMEMORY_LOCALE__");
  });

  it("escapes < inside injected JSON to prevent script-tag breakout", () => {
    process.env["VIEWER_LANGUAGE"] = "en";
    const r = renderViewerDocument();
    expect(r.found).toBe(true);
    if (!r.found) return;
    // After injection there must be no </script literal anywhere in the JSON payload
    const match = r.html.match(/window\.__AM_LOCALE__\s*=\s*([^;]+);/);
    expect(match).toBeTruthy();
    if (match) {
      expect(match[1]).not.toContain("</script");
    }
  });
});
