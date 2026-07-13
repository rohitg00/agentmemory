import type { RecallTokenEstimator } from "../types.js";

const CJK_CHAR = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/u;

export function getTokenEstimator(_hint?: string): RecallTokenEstimator {
  return {
    name: "conservative-unicode",
    version: "1",
    estimated: true,
  };
}

export function countTokens(text: string): number {
  let tokens = 0;
  let asciiRun = 0;
  for (const char of text) {
    if (CJK_CHAR.test(char)) {
      tokens += Math.ceil(asciiRun / 4);
      asciiRun = 0;
      tokens += 1;
    } else {
      asciiRun += char.length;
    }
  }
  return tokens + Math.ceil(asciiRun / 4);
}
