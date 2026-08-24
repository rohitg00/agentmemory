import { getEnvVar } from "../config.js";

/**
 * Maps common short language codes / names to a canonical language label that
 * reads naturally inside an instruction sentence. Anything not in the table is
 * used verbatim, so `AGENTMEMORY_OUTPUT_LANG=Português` also works.
 */
const LANGUAGE_LABELS: Record<string, string> = {
  zh: "Simplified Chinese",
  "zh-cn": "Simplified Chinese",
  "zh-hans": "Simplified Chinese",
  chinese: "Simplified Chinese",
  "zh-tw": "Traditional Chinese",
  "zh-hant": "Traditional Chinese",
  en: "English",
  english: "English",
  ja: "Japanese",
  japanese: "Japanese",
  ko: "Korean",
  korean: "Korean",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  ru: "Russian",
};

/**
 * Returns a directive, suitable for appending to any LLM *system* prompt, that
 * controls the natural language of generated text fields (title, narrative,
 * facts, concepts, summary, …). Code, identifiers, and file paths are always
 * preserved verbatim.
 *
 * Controlled by the `AGENTMEMORY_OUTPUT_LANG` environment variable:
 *   - unset / empty  → returns "" (no change to current behaviour; the model
 *                       follows whatever language the system prompt is written
 *                       in, i.e. English)
 *   - "match"         → follow the language of the user's input/observation
 *   - "zh" | "ja" | … → a known code, expanded to a full language label
 *   - any other value → used verbatim as the target language name
 *
 * Returning "" for the unset case keeps the default behaviour byte-for-byte, so
 * this is a strictly opt-in feature.
 */
export function outputLanguageDirective(): string {
  const raw = (getEnvVar("AGENTMEMORY_OUTPUT_LANG") ?? "").trim();
  if (!raw) return "";

  if (raw.toLowerCase() === "match") {
    return (
      "\n\nIMPORTANT — OUTPUT LANGUAGE: Write all natural-language text fields " +
      "(title, subtitle, narrative, facts, concepts, summary, etc.) in the SAME " +
      "language as the user's input/observation content. If the input mixes " +
      "languages, use the dominant language of the user's prose. Keep code, " +
      "identifiers, and file paths verbatim. Do NOT translate user-language " +
      "content to another language."
    );
  }

  const label = LANGUAGE_LABELS[raw.toLowerCase()] ?? raw;
  return (
    `\n\nIMPORTANT — OUTPUT LANGUAGE: Write all natural-language text fields ` +
    `(title, subtitle, narrative, facts, concepts, summary, etc.) in ${label}. ` +
    `Keep code, identifiers, and file paths verbatim.`
  );
}
