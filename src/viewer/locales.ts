import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type LocaleMessages = Record<string, unknown>;

export type LocaleBundle = {
  lang: string;
  messages: LocaleMessages;
  fallback: LocaleMessages;
};

function canonicalLanguage(input: string | undefined): string {
  const primary = (input || "en").trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(primary) ? primary : "en";
}

export function resolveViewerLanguage(): string {
  return canonicalLanguage(process.env["VIEWER_LANGUAGE"]);
}

export function loadLocale(lang: string): LocaleMessages {
  const safeLang = lang.trim().toLowerCase();
  if (!/^[a-z]{2,3}$/.test(safeLang)) return {};

  const base = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(base, "locales", `${safeLang}.json`),
    join(base, "..", "src", "viewer", "locales", `${safeLang}.json`),
    join(base, "..", "viewer", "locales", `${safeLang}.json`),
  ];

  for (const path of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf-8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as LocaleMessages)
        : {};
    } catch {}
  }

  return {};
}

export function buildLocaleBundle(lang: string): LocaleBundle {
  const canonical = canonicalLanguage(lang);
  const messages = loadLocale(canonical);
  if (canonical === "en" || Object.keys(messages).length === 0) {
    return {
      lang: "en",
      messages: loadLocale("en"),
      fallback: {},
    };
  }

  return {
    lang: canonical,
    messages,
    fallback: loadLocale("en"),
  };
}
