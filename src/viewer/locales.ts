import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Locale = Record<string, unknown>;

const FALLBACK_LANG = "en";
// BCP-47 primary subtag: 2-3 ASCII letters. Anything richer is normalized down
// to the primary subtag by resolveViewerLanguage() before reaching loadLocale,
// so this also serves as a path-traversal guard at the boundary. Applied
// after lang is lowercased in loadLocale.
const VALID_LANG = /^[a-z]{2,3}$/;
const cache = new Map<string, Locale>();
let resolvedLocalesDir: string | null = null;

function localesDir(): string {
  if (resolvedLocalesDir !== null) return resolvedLocalesDir;
  const base = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    join(base, "..", "src", "viewer", "locales"),
    join(base, "..", "viewer", "locales"),
    join(base, "viewer", "locales"),
  ]) {
    try {
      readdirSync(candidate);
      resolvedLocalesDir = candidate;
      return candidate;
    } catch {
      // candidate path does not exist; try next
    }
  }
  resolvedLocalesDir = "";
  return "";
}

export function loadLocale(lang: string): Locale {
  // Normalize before validate/cache/file so loadLocale("EN") and loadLocale(" en ")
  // both resolve to en.json with a single cache entry.
  const normalized = lang.trim().toLowerCase();
  if (!VALID_LANG.test(normalized)) {
    cache.set(normalized, {});
    return {};
  }
  if (cache.has(normalized)) return cache.get(normalized)!;
  const dir = localesDir();
  if (!dir) {
    cache.set(normalized, {});
    return {};
  }
  try {
    const text = readFileSync(join(dir, `${normalized}.json`), "utf-8");
    const data = JSON.parse(text) as Locale;
    cache.set(normalized, data);
    return data;
  } catch {
    cache.set(normalized, {});
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
