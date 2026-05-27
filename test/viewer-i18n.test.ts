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

  it("normalizes zh-CN to zh", () => {
    process.env["VIEWER_LANGUAGE"] = "zh-CN";
    expect(resolveViewerLanguage()).toBe("zh");
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

  it("loads zh.json for Simplified Chinese viewer labels", () => {
    const zh = loadLocale("zh");
    expect((zh["nav"] as Record<string, string>)["dashboard"]).toBe("仪表盘");
    expect((zh["timeline"] as Record<string, string>)["select_placeholder"]).toBe("选择会话");
  });

  it("rejects path-traversal sequences without filesystem access", () => {
    expect(loadLocale("../etc/passwd")).toEqual({});
    expect(loadLocale("../../secret")).toEqual({});
    expect(loadLocale("en/../en")).toEqual({});
    expect(loadLocale("..\\windows\\system32")).toEqual({});
  });

  it("rejects non-language inputs (numbers, separators, empty)", () => {
    expect(loadLocale("")).toEqual({});
    expect(loadLocale("123")).toEqual({});
    expect(loadLocale("en-US")).toEqual({});
    expect(loadLocale("a")).toEqual({});
    expect(loadLocale("abcd")).toEqual({});
  });

  it("normalizes mixed-case input to find the lowercase locale file", () => {
    const en = loadLocale("en");
    expect(en["nav"]).toBeDefined();
    // EN and " en " and En should all resolve to the same loaded bundle
    expect(loadLocale("EN")).toEqual(en);
    expect(loadLocale("En")).toEqual(en);
    expect(loadLocale("  en  ")).toEqual(en);
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

  it("canonicalizes regional language tags before loading the bundle", () => {
    const bundle = buildLocaleBundle(" zh-CN ");
    expect(bundle.lang).toBe("zh");
    expect((bundle.messages["nav"] as Record<string, string>)["dashboard"]).toBe("仪表盘");
    expect(bundle.fallback).toEqual(loadLocale("en"));
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

  it("injects zh messages when VIEWER_LANGUAGE=zh-CN", () => {
    process.env["VIEWER_LANGUAGE"] = "zh-CN";
    const r = renderViewerDocument();
    expect(r.found).toBe(true);
    if (!r.found) return;
    expect(r.html).toContain('"lang":"zh"');
    expect(r.html).toContain("仪表盘");
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

  it("ships an HTML-escaping t() so malicious translations cannot inject markup", () => {
    process.env["VIEWER_LANGUAGE"] = "en";
    const r = renderViewerDocument();
    expect(r.found).toBe(true);
    if (!r.found) return;
    expect(r.html).toContain("function escI18n");
    expect(r.html).toMatch(/window\.t\s*=\s*function[\s\S]*escI18n/);
  });

  it("ships a data-i18n-attr allowlist that excludes script-execution attributes", () => {
    process.env["VIEWER_LANGUAGE"] = "en";
    const r = renderViewerDocument();
    expect(r.found).toBe(true);
    if (!r.found) return;
    expect(r.html).toContain("SAFE_I18N_ATTRS");
    expect(r.html).toMatch(/SAFE_I18N_ATTRS\.has\(attr\)/);
    // Allowlist must not silently grow to include dangerous attributes
    const block = r.html.match(/SAFE_I18N_ATTRS\s*=\s*new Set\(\[([^\]]+)\]/);
    expect(block).toBeTruthy();
    if (block) {
      const list = block[1];
      expect(list).not.toMatch(/"href"|"src"|"srcset"|"action"|"formaction"|"on[a-z]+"/);
      // IDREF ARIA attributes must reference element IDs, not free text.
      expect(list).not.toMatch(/"aria-labelledby"|"aria-describedby"/);
    }
  });

  it("localizes runtime WebSocket status transitions", () => {
    process.env["VIEWER_LANGUAGE"] = "en";
    const r = renderViewerDocument();
    expect(r.found).toBe(true);
    if (!r.found) return;
    expect(r.html).toContain("t('status.polling'");
    expect(r.html).toContain("t('status.connecting'");
  });
});

describe("viewer i18n: structural parity with en", () => {
  const targetLocales = ["de", "zh"];

  function leafPaths(obj: unknown, prefix = ""): string[] {
    if (!obj || typeof obj !== "object") return [];
    const out: string[] = [];
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "string") out.push(path);
      else if (v && typeof v === "object") out.push(...leafPaths(v, path));
    }
    return out;
  }

  it.each(targetLocales)("%s.json has every top-level key that en.json has", (lang) => {
    const en = loadLocale("en");
    const target = loadLocale(lang);
    for (const key of Object.keys(en)) {
      expect(target[key], `missing top-level key '${key}' in ${lang}.json`).toBeDefined();
    }
  });

  it.each(targetLocales)("%s.json covers every nested leaf path from en.json", (lang) => {
    const enPaths = leafPaths(loadLocale("en"));
    const targetPaths = new Set(leafPaths(loadLocale(lang)));
    const missing = enPaths.filter((p) => !targetPaths.has(p));
    expect(missing, `${lang}.json missing ${missing.length} nested key(s)`).toEqual([]);
  });

  it.each(targetLocales)("%s.json preserves every {placeholder} marker from en.json", (lang) => {
    const en = loadLocale("en");
    const target = loadLocale(lang);
    const enFlat: Record<string, string> = {};
    const targetFlat: Record<string, string> = {};
    function flat(o: unknown, p: string, out: Record<string, string>): void {
      if (!o || typeof o !== "object") return;
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        const path = p ? `${p}.${k}` : k;
        if (typeof v === "string") out[path] = v;
        else if (v && typeof v === "object") flat(v, path, out);
      }
    }
    flat(en, "", enFlat);
    flat(target, "", targetFlat);
    const mismatches: string[] = [];
    for (const [path, enVal] of Object.entries(enFlat)) {
      const targetVal = targetFlat[path];
      // Skip only when the target key is genuinely missing; empty-string
      // translations must still be checked for placeholder parity.
      if (typeof targetVal !== "string") continue;
      const enMarkers = (enVal.match(/\{\w+\}/g) || []).sort().join(",");
      const targetMarkers = (targetVal.match(/\{\w+\}/g) || []).sort().join(",");
      if (enMarkers !== targetMarkers) mismatches.push(`${path}: en=${enMarkers} ${lang}=${targetMarkers}`);
    }
    expect(mismatches, `placeholder mismatches: ${mismatches.join("; ")}`).toEqual([]);
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
