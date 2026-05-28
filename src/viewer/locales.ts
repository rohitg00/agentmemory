import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Nested translation dictionary loaded from a viewer locale JSON file. */
export type Locale = Record<string, unknown>;

const FALLBACK_LANG = "en";
// BCP-47 primary subtag: 2-3 ASCII letters. Anything richer is normalized down
// to the primary subtag by resolveViewerLanguage() before reaching loadLocale,
// so this also serves as a path-traversal guard at the boundary. Applied
// after lang is lowercased in loadLocale.
const VALID_LANG = /^[a-z]{2,3}$/;
const cache = new Map<string, Locale>();
let resolvedLocalesDir: string | null = null;

/** Finds the locale asset directory in source and packaged build layouts. */
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

/** Reduces a BCP-47-ish input to the primary language subtag used by bundled locale filenames. */
function normalizeLanguageTag(lang: string): string {
  const raw = lang.trim().toLowerCase();
  if (!raw) return FALLBACK_LANG;
  const head = raw.split(/[-_]/)[0];
  return head || FALLBACK_LANG;
}

/**
 * Loads a bundled locale JSON file after strict primary-subtag validation.
 *
 * The validation is deliberately narrower than full BCP-47 because packaged
 * locale filenames are primary subtags only, and the same check prevents path
 * traversal from untrusted language values.
 */
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

/** Resolves VIEWER_LANGUAGE to the primary language subtag supported by locale files. */
export function resolveViewerLanguage(): string {
  const raw = process.env["VIEWER_LANGUAGE"]?.trim().toLowerCase();
  if (!raw) return FALLBACK_LANG;
  const head = raw.split(/[-_]/)[0];
  return VALID_LANG.test(head) ? head : FALLBACK_LANG;
}

/** Runtime locale payload injected into the viewer HTML document. */
export interface LocaleBundle {
  lang: string;
  messages: Locale;
  fallback: Locale;
}

/**
 * Builds the viewer's active locale plus English fallback bundle.
 *
 * The returned lang is canonicalized so callers can pass regional values such as
 * zh-CN while the browser receives the same primary tag used for file loading.
 */
export function buildLocaleBundle(lang: string): LocaleBundle {
  let normalized = normalizeLanguageTag(lang);
  if (!VALID_LANG.test(normalized)) {
    normalized = FALLBACK_LANG;
  }
  const messages = loadLocale(normalized);
  const fallback = normalized === FALLBACK_LANG ? {} : loadLocale(FALLBACK_LANG);
  return { lang: normalized, messages, fallback };
}
