import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VIEWER_LOCALE_PLACEHOLDER,
  VIEWER_NONCE_PLACEHOLDER,
  createViewerNonce,
  buildViewerCsp,
} from "../auth.js";
import { VERSION } from "../version.js";
import { buildLocaleBundle, resolveViewerLanguage } from "./locales.js";

const VIEWER_VERSION_PLACEHOLDER = "__AGENTMEMORY_VERSION__";

function loadViewerTemplate(): string | null {
  const base = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(base, "..", "src", "viewer", "index.html"),
    join(base, "..", "viewer", "index.html"),
    join(base, "viewer", "index.html"),
  ];
  for (const path of candidates) {
    try {
      return readFileSync(path, "utf-8");
    } catch {}
  }
  return null;
}

export function renderViewerDocument():
  | { found: true; html: string; csp: string }
  | { found: false } {
  const template = loadViewerTemplate();
  if (!template) {
    return { found: false };
  }

  const nonce = createViewerNonce();
  const bundle = buildLocaleBundle(resolveViewerLanguage());
  const localeJson = JSON.stringify(bundle).replace(/</g, "\\u003c");
  const html = template
    .replaceAll(VIEWER_NONCE_PLACEHOLDER, nonce)
    .replaceAll(VIEWER_VERSION_PLACEHOLDER, VERSION)
    .replaceAll(VIEWER_LOCALE_PLACEHOLDER, localeJson);
  return {
    found: true,
    html,
    csp: buildViewerCsp(nonce),
  };
}
