import { afterEach, describe, expect, it } from "vitest";
import {
  buildLocaleBundle,
  loadLocale,
  resolveViewerLanguage,
} from "../src/viewer/locales.js";
import { renderViewerDocument } from "../src/viewer/document.js";

describe("viewer i18n language resolution", () => {
  const original = process.env["VIEWER_LANGUAGE"];

  afterEach(() => {
    if (original === undefined) delete process.env["VIEWER_LANGUAGE"];
    else process.env["VIEWER_LANGUAGE"] = original;
  });

  it("defaults to en when VIEWER_LANGUAGE is unset", () => {
    delete process.env["VIEWER_LANGUAGE"];

    expect(resolveViewerLanguage()).toBe("en");
  });

  it("canonicalizes regional Chinese language tags to zh", () => {
    process.env["VIEWER_LANGUAGE"] = "zh-CN";

    expect(resolveViewerLanguage()).toBe("zh");
  });

  it("canonicalizes uppercase and underscore language tags", () => {
    process.env["VIEWER_LANGUAGE"] = "ZH_TW";

    expect(resolveViewerLanguage()).toBe("zh");
  });
});

describe("viewer i18n locale loading", () => {
  it("loads the English baseline locale", () => {
    const en = loadLocale("en");

    expect(en["nav"]).toBeDefined();
    expect((en["nav"] as Record<string, string>)["dashboard"]).toBe("Dashboard");
  });

  it("loads the Simplified Chinese viewer locale", () => {
    const zh = loadLocale("zh");

    expect((zh["nav"] as Record<string, string>)["dashboard"]).toBe("仪表盘");
    expect((zh["status"] as Record<string, string>)["live_updates_off"]).toBe(
      "实时更新关闭",
    );
  });

  it("rejects traversal and non-language locale names", () => {
    expect(loadLocale("../en")).toEqual({});
    expect(loadLocale("en/../en")).toEqual({});
    expect(loadLocale("..\\windows\\system32")).toEqual({});
    expect(loadLocale("123")).toEqual({});
    expect(loadLocale("a")).toEqual({});
    expect(loadLocale("abcd")).toEqual({});
  });
});

describe("viewer i18n bundle building", () => {
  it("includes English fallback when Chinese is selected", () => {
    const bundle = buildLocaleBundle("zh-CN");

    expect(bundle.lang).toBe("zh");
    expect((bundle.messages["nav"] as Record<string, string>)["dashboard"]).toBe(
      "仪表盘",
    );
    expect((bundle.fallback["nav"] as Record<string, string>)["dashboard"]).toBe(
      "Dashboard",
    );
  });

  it("falls back to English for invalid bundle language input", () => {
    const bundle = buildLocaleBundle("../zh");

    expect(bundle.lang).toBe("en");
    expect((bundle.messages["nav"] as Record<string, string>)["dashboard"]).toBe(
      "Dashboard",
    );
    expect(bundle.fallback).toEqual({});
  });
});

describe("viewer i18n document injection", () => {
  const original = process.env["VIEWER_LANGUAGE"];

  afterEach(() => {
    if (original === undefined) delete process.env["VIEWER_LANGUAGE"];
    else process.env["VIEWER_LANGUAGE"] = original;
  });

  it("injects the selected Chinese locale into the viewer document", () => {
    process.env["VIEWER_LANGUAGE"] = "zh-CN";

    const rendered = renderViewerDocument();

    expect(rendered.found).toBe(true);
    if (!rendered.found) return;
    expect(rendered.html).toContain('"lang":"zh"');
    expect(rendered.html).toContain("仪表盘");
    expect(rendered.html).not.toContain("__AGENTMEMORY_LOCALE__");
  });

  it("escapes script-breaking characters in injected locale JSON", () => {
    process.env["VIEWER_LANGUAGE"] = "en";

    const rendered = renderViewerDocument();

    expect(rendered.found).toBe(true);
    if (!rendered.found) return;
    const match = rendered.html.match(/window\.__AM_LOCALE__\s*=\s*([^;]+);/);
    expect(match).toBeTruthy();
    expect(match?.[1]).not.toContain("</script");
  });
});

describe("viewer i18n locale parity", () => {
  function leafPaths(value: unknown, prefix = ""): string[] {
    if (!value || typeof value !== "object") return [];
    const paths: string[] = [];
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof child === "string") paths.push(path);
      else paths.push(...leafPaths(child, path));
    }
    return paths;
  }

  it("zh.json covers every nested English locale key", () => {
    const englishPaths = leafPaths(loadLocale("en"));
    const chinesePaths = new Set(leafPaths(loadLocale("zh")));
    const missing = englishPaths.filter((path) => !chinesePaths.has(path));

    expect(missing).toEqual([]);
  });

  it("zh.json preserves every placeholder marker from en.json", () => {
    const english = loadLocale("en");
    const chinese = loadLocale("zh");
    const flatEnglish: Record<string, string> = {};
    const flatChinese: Record<string, string> = {};

    function flatten(
      value: unknown,
      prefix: string,
      out: Record<string, string>,
    ): void {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof child === "string") out[path] = child;
        else flatten(child, path, out);
      }
    }

    flatten(english, "", flatEnglish);
    flatten(chinese, "", flatChinese);
    const mismatches: string[] = [];
    for (const [path, englishValue] of Object.entries(flatEnglish)) {
      const chineseValue = flatChinese[path];
      if (typeof chineseValue !== "string") continue;
      const englishMarkers = (englishValue.match(/\{\w+\}/g) || [])
        .sort()
        .join(",");
      const chineseMarkers = (chineseValue.match(/\{\w+\}/g) || [])
        .sort()
        .join(",");
      if (englishMarkers !== chineseMarkers) {
        mismatches.push(`${path}: en=${englishMarkers} zh=${chineseMarkers}`);
      }
    }

    expect(mismatches).toEqual([]);
  });
});
