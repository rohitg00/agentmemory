import { getEnvVar } from "../config.js";

function normalizeOutputLanguage(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : "auto";
}

export function getOutputLanguage(): string {
  return normalizeOutputLanguage(getEnvVar("AGENTMEMORY_OUTPUT_LANGUAGE"));
}

export function buildOutputLanguageInstruction(
  preserve: string[] = [],
): string {
  const language = getOutputLanguage();
  const normalized = language.toLowerCase();
  const target =
    normalized === "auto" || normalized === "source" || normalized === "input"
      ? "Match the dominant natural language of the input. If the input is Chinese, write human-readable output in Chinese."
      : `Write human-readable output in ${language}.`;
  const lines = [
    "Language:",
    `- ${target}`,
    "- Do not translate source-language user wording, file paths, code identifiers, package names, URLs, or quoted command/output text unless translation is necessary for clarity.",
  ];
  if (preserve.length > 0) {
    lines.push(`- Preserve ${preserve.join(", ")} exactly as specified.`);
  }
  return lines.join("\n");
}
