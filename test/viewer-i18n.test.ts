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

describe("viewer i18n: structural parity en ↔ de", () => {
  it("de.json has every top-level key that en.json has", () => {
    const en = loadLocale("en");
    const de = loadLocale("de");
    for (const key of Object.keys(en)) {
      expect(de[key], `missing top-level key '${key}' in de.json`).toBeDefined();
    }
  });
});

describe("viewer i18n: t() helper semantics (simulated)", () => {
  function tFactory(messages: Record<string, unknown>, fallback: Record<string, unknown>) {
    function getPath(obj: unknown, path: string): unknown {
      return path.split(".").reduce<unknown>((o, k) => {
        if (o && typeof o === "object" && k in (o as Record<string, unknown>)) {
          return (o as Record<string, unknown>)[k];
        }
        return undefined;
      }, obj);
    }
    function interpolate(str: string, vars?: Record<string, unknown>): string {
      if (!vars) return str;
      return str.replace(/\{(\w+)\}/g, (_, k) =>
        Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : "{" + k + "}"
      );
    }
    return (key: string, vars?: Record<string, unknown>) => {
      const v = getPath(messages, key);
      if (typeof v === "string") return interpolate(v, vars);
      const fb = getPath(fallback, key);
      if (typeof fb === "string") return interpolate(fb, vars);
      return key;
    };
  }

  it("returns messages value when present", () => {
    const t = tFactory({ nav: { dashboard: "Übersicht" } }, { nav: { dashboard: "Dashboard" } });
    expect(t("nav.dashboard")).toBe("Übersicht");
  });

  it("falls back to en when missing in target locale", () => {
    const t = tFactory({}, { nav: { dashboard: "Dashboard" } });
    expect(t("nav.dashboard")).toBe("Dashboard");
  });

  it("returns the key when missing in both", () => {
    const t = tFactory({}, {});
    expect(t("nav.dashboard")).toBe("nav.dashboard");
  });

  it("interpolates {placeholder} from vars", () => {
    const t = tFactory({ msg: "Hi {who}" }, {});
    expect(t("msg", { who: "Chris" })).toBe("Hi Chris");
  });

  it("leaves placeholder literal when var missing", () => {
    const t = tFactory({ msg: "Hi {who}" }, {});
    expect(t("msg")).toBe("Hi {who}");
  });
});
