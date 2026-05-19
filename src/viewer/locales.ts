import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Locale = Record<string, unknown>;

const FALLBACK_LANG = "en";
const cache = new Map<string, Locale>();

function localesDir(): string {
  const base = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    join(base, "..", "src", "viewer", "locales"),
    join(base, "..", "viewer", "locales"),
    join(base, "viewer", "locales"),
  ]) {
    try {
      readdirSync(candidate);
      return candidate;
    } catch {
      // candidate path does not exist; try next
    }
  }
  return "";
}

export function loadLocale(lang: string): Locale {
  if (cache.has(lang)) return cache.get(lang)!;
  const dir = localesDir();
  if (!dir) {
    cache.set(lang, {});
    return {};
  }
  try {
    const text = readFileSync(join(dir, `${lang}.json`), "utf-8");
    const data = JSON.parse(text) as Locale;
    cache.set(lang, data);
    return data;
  } catch {
    cache.set(lang, {});
    return {};
  }
}

export function resolveViewerLanguage(): string {
  const raw = process.env["VIEWER_LANGUAGE"]?.trim().toLowerCase();
  if (!raw) return FALLBACK_LANG;
  const head = raw.split(/[-_]/)[0];
  return head || FALLBACK_LANG;
}

export interface LocaleBundle {
  lang: string;
  messages: Locale;
  fallback: Locale;
}

export function buildLocaleBundle(lang: string): LocaleBundle {
  const messages = loadLocale(lang);
  const fallback = lang === FALLBACK_LANG ? {} : loadLocale(FALLBACK_LANG);
  return { lang, messages, fallback };
}
