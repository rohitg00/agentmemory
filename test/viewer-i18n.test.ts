import * as vm from "node:vm";
import { describe, expect, it } from "vitest";
import { renderViewerDocument } from "../src/viewer/document.js";

type ViewerStrings = Record<string, Record<string, string>>;

function loadViewerSource(): { html: string; script: string; strings: ViewerStrings } {
  const rendered = renderViewerDocument();
  expect(rendered.found).toBe(true);
  if (!rendered.found) throw new Error("viewer document not found");

  const scriptMatch = rendered.html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
  expect(scriptMatch).not.toBeNull();
  if (!scriptMatch) throw new Error("viewer script not found");

  const dictionaryMatch = scriptMatch[1].match(
    /var I18N_STRINGS = ([\s\S]*?);\n\s*var SUPPORTED_LOCALES/,
  );
  expect(dictionaryMatch).not.toBeNull();
  if (!dictionaryMatch) throw new Error("viewer i18n dictionary not found");

  const strings = vm.runInNewContext(`(${dictionaryMatch[1]})`) as ViewerStrings;
  return { html: rendered.html, script: scriptMatch[1], strings };
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

function createViewerSandbox(script: string) {
  const elements = new Map<string, Record<string, any>>();
  const storageValues = new Map<string, string>();
  const documentLocale = { lang: "en", dataset: {} as Record<string, string> };

  const createElement = (id = "") => {
    const attributes = new Map<string, string>();
    const classes = new Set<string>();
    return {
      id,
      innerHTML: "",
      textContent: "",
      value: "",
      dataset: {} as Record<string, string>,
      classList: {
        add: (name: string) => classes.add(name),
        remove: (name: string) => classes.delete(name),
        contains: (name: string) => classes.has(name),
        toggle: (name: string, force?: boolean) => {
          const enabled = force ?? !classes.has(name);
          if (enabled) classes.add(name);
          else classes.delete(name);
          return enabled;
        },
      },
      addEventListener: () => {},
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: unknown) => attributes.set(name, String(value)),
      removeAttribute: (name: string) => attributes.delete(name),
      querySelectorAll: () => [],
    };
  };

  const getElement = (id: string) => {
    if (!elements.has(id)) elements.set(id, createElement(id));
    return elements.get(id);
  };

  const document = {
    documentElement: documentLocale,
    createElement: () => {
      let text = "";
      return {
        set textContent(value: unknown) {
          text = String(value ?? "");
        },
        get innerHTML() {
          return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
        },
      };
    },
    getElementById: getElement,
    querySelectorAll: () => [],
    addEventListener: () => {},
  };

  const sandbox: Record<string, any> = {
    console: { log: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    document,
    window: {
      location: {
        search: "",
        hash: "",
        port: "3113",
        protocol: "http:",
        hostname: "localhost",
        host: "localhost:3113",
        origin: "http://localhost:3113",
      },
      matchMedia: () => ({ matches: false }),
      addEventListener: () => {},
    },
    location: { hash: "", pathname: "/", search: "" },
    history: { replaceState: () => {}, pushState: () => {} },
    localStorage: {
      getItem: (key: string) => storageValues.get(key) ?? null,
      setItem: (key: string, value: string) => storageValues.set(key, value),
      removeItem: (key: string) => storageValues.delete(key),
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    WebSocket: function WebSocket() {},
    navigator: { language: "en-US", languages: ["en-US"], userAgent: "vitest" },
    Element: function Element() {},
    AbortSignal: { timeout: () => ({}) },
    alert: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: () => 0,
    URLSearchParams,
    Date,
    Math,
    Promise,
    JSON,
    Array,
    Object,
    String,
    Number,
    Set,
    Map,
    Number: Number,
    parseInt,
    parseFloat,
    encodeURIComponent,
  };

  const scriptWithoutAutoStart = script
    .replace(/\n\s*switchTab\(tabFromRoute\(\), \{ replaceRoute: true \}\);/, "\n")
    .replace(/\n\s*\/\/ Resolve the stream WebSocket target[\s\S]*?startDashboardAutoRefresh\(\);\s*/, "\n")
    .replace(/\n\s*\/\/ Ambient background:[\s\S]*$/, "\n");

  vm.createContext(sandbox);
  vm.runInContext(scriptWithoutAutoStart, sandbox);
  sandbox.switchTab = () => {};

  return { sandbox, documentLocale, storageValues };
}

describe("viewer i18n structure", () => {
  it("keeps locale key sets and named placeholders identical", () => {
    const { strings } = loadViewerSource();
    const enKeys = Object.keys(strings.en).sort();
    const zhKeys = Object.keys(strings["zh-CN"]).sort();

    expect(zhKeys, "zh-CN must contain exactly the en key set").toEqual(enKeys);
    for (const key of enKeys) {
      expect(
        placeholders(strings["zh-CN"][key]),
        `placeholder set differs for ${key}`,
      ).toEqual(placeholders(strings.en[key]));
    }
  });

  it("references only dictionary keys from t calls and static i18n bindings", () => {
    const { html, script, strings } = loadViewerSource();
    const knownKeys = new Set(Object.keys(strings.en));
    const tKeys = [...script.matchAll(/\bt\(\s*'([^']+)'/g)].map((match) => match[1]);
    const staticKeys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((match) => match[1]);
    const attributeKeys = [...html.matchAll(/data-i18n-attr="([^"]+)"/g)].flatMap((match) =>
      match[1].split(";").map((definition) => definition.slice(definition.indexOf(":") + 1)),
    );

    for (const key of [...tKeys, ...staticKeys, ...attributeKeys]) {
      expect(knownKeys.has(key), `missing i18n key: ${key}`).toBe(true);
    }
  });

  it("preserves the CSP-safe i18n structure and supported locale controls", () => {
    const { html } = loadViewerSource();
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toContain("data-i18n-html");
    expect(html).toMatch(/<html\s+lang="en"/);

    const select = html.match(/<select id="locale-switcher"[\s\S]*?<\/select>/)?.[0];
    expect(select, "locale switcher must exist").toBeDefined();
    expect([...select!.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1])).toEqual([
      "en",
      "zh-CN",
    ]);
  });
});

describe("viewer i18n behavior", () => {
  it("uses the English value, documents the key fallback, and interpolates once", () => {
    const { script } = loadViewerSource();
    const { sandbox } = createViewerSandbox(script);

    expect(sandbox.t("common.actions.refresh")).toBe("Refresh");
    expect(sandbox.t("nope.key")).toBe("nope.key");
    expect(sandbox.t("common.states.polling", { n: 7 })).toBe("polling · 7");
    expect(sandbox.t("common.states.polling", { n: "{nested}" })).toBe("polling · {nested}");
  });

  it("persists a locale change and resolves it from storage", () => {
    const { script } = loadViewerSource();
    const { sandbox, storageValues } = createViewerSandbox(script);

    expect(sandbox.setLocale("zh-CN", true)).toBe(true);
    expect(storageValues.get("agentmemory-locale")).toBe("zh-CN");
    expect(sandbox.resolveLocale()).toBe("zh-CN");
  });

  it("applies query, storage, browser, and English fallback precedence", () => {
    const { script } = loadViewerSource();
    const { sandbox, storageValues } = createViewerSandbox(script);
    const setQuery = (value: string) => {
      sandbox.window.location.search = value;
    };

    storageValues.set("agentmemory-locale", "en");
    sandbox.navigator.languages = ["en-US"];
    setQuery("?lang=zh-TW");
    expect(sandbox.resolveLocale()).toBe("zh-CN");

    setQuery("");
    storageValues.set("agentmemory-locale", "zh-CN");
    expect(sandbox.resolveLocale()).toBe("zh-CN");

    storageValues.delete("agentmemory-locale");
    sandbox.navigator.languages = ["zh-Hant"];
    expect(sandbox.resolveLocale()).toBe("zh-CN");

    sandbox.navigator.languages = ["fr-FR"];
    expect(sandbox.resolveLocale()).toBe("en");
  });

  it("falls through unsupported and empty query locales to stored preferences", () => {
    const { script } = loadViewerSource();
    const { sandbox, storageValues } = createViewerSandbox(script);
    const setQuery = (value: string) => {
      sandbox.window.location.search = value;
    };

    storageValues.set("agentmemory-locale", "zh-CN");
    setQuery("?lang=fr-FR");
    expect(sandbox.resolveLocale()).toBe("zh-CN");

    setQuery("?lang=");
    expect(sandbox.resolveLocale()).toBe("zh-CN");

    setQuery("?lang=ZH-cn");
    expect(sandbox.resolveLocale()).toBe("zh-CN");

    setQuery("?lang=zh-TW");
    expect(sandbox.resolveLocale()).toBe("zh-CN");
  });

  it("normalizes supported language families and rejects unsupported setLocale values", () => {
    const { script } = loadViewerSource();
    const { sandbox } = createViewerSandbox(script);

    expect(sandbox.normalizeLocale("zh-TW")).toBe("zh-CN");
    expect(sandbox.normalizeLocale("zh-Hant")).toBe("zh-CN");
    expect(sandbox.normalizeLocale("zh")).toBe("zh-CN");
    expect(sandbox.normalizeLocale("en-GB")).toBe("en");
    expect(sandbox.normalizeLocale("fr-FR")).toBe("en");

    const before = sandbox.activeLocale;
    expect(sandbox.setLocale("fr-FR", true)).toBe(false);
    expect(sandbox.activeLocale).toBe(before);
  });

  it("translates known enum values and echoes unknown backend values", () => {
    const { script } = loadViewerSource();
    const { sandbox } = createViewerSandbox(script);

    expect(sandbox.localizedEnumLabel("dashboard.relations.type", "related", "related")).toBe("related");
    expect(sandbox.localizedEnumLabel("dashboard.relations.type", "backend_relation", "backend_relation")).toBe("backend_relation");
    sandbox.setLocale("zh-CN", false);
    expect(sandbox.localizedEnumLabel("dashboard.relations.type", "related", "related")).toBe("相关");
    expect(sandbox.localizedEnumLabel("dashboard.relations.type", "backend_relation", "backend_relation")).toBe("backend_relation");
  });

  it("covers every dynamically-built enum namespace in both locales", () => {
    const { script, strings } = loadViewerSource();
    const namespaces = [...new Set(
      [...script.matchAll(/localizedEnumLabel\('([^']+)'/g)].map((match) => match[1]),
    )].sort();

    expect(namespaces, "all localized enum namespaces must be discovered from the source").toHaveLength(11);
    for (const namespace of namespaces) {
      const concreteKeys = Object.keys(strings.en).filter((key) => key.startsWith(`${namespace}.`));
      expect(concreteKeys.length, `missing concrete en enum key for ${namespace}`).toBeGreaterThan(0);
      expect(
        concreteKeys.some((key) => typeof strings["zh-CN"][key] === "string"),
        `missing concrete zh-CN enum key for ${namespace}`,
      ).toBe(true);
    }
  });
});
