import { createRequire } from "node:module";

const cjkRequire = createRequire(import.meta.url);

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const HAN_RE = /\p{Script=Han}/u;
const KANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HANGUL_RE = /\p{Script=Hangul}/u;
const CJK_RUN_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;
const HANGUL_BLOCK_RE = /[가-힯]+/g;

type Script = "han" | "kana" | "hangul" | "other";

const hintShown = new Set<string>();

export function hasCjk(text: string): boolean {
  return CJK_RE.test(text);
}

export function detectScript(text: string): Script {
  if (HAN_RE.test(text)) return "han";
  if (KANA_RE.test(text)) return "kana";
  if (HANGUL_RE.test(text)) return "hangul";
  return "other";
}

function showHintOnce(key: string, message: string): void {
  if (hintShown.has(key)) return;
  hintShown.add(key);
  if (typeof process !== "undefined" && process.stderr?.write) {
    process.stderr.write(`agentmemory: ${message}\n`);
  }
}

interface JiebaInstance {
  cut(text: string, hmm?: boolean): string[];
}

let jiebaInstance: JiebaInstance | null = null;
let jiebaLoaded = false;

function getJieba(): JiebaInstance | null {
  if (jiebaLoaded) return jiebaInstance;
  jiebaLoaded = true;
  try {
    const mod = cjkRequire("@node-rs/jieba") as {
      Jieba: {
        new (): JiebaInstance;
        withDict(dict: Uint8Array): JiebaInstance;
      };
    };
    try {
      const dictMod = cjkRequire("@node-rs/jieba/dict") as { dict: Uint8Array };
      jiebaInstance = mod.Jieba.withDict(dictMod.dict);
    } catch {
      jiebaInstance = new mod.Jieba();
    }
    return jiebaInstance;
  } catch {
    showHintOnce(
      "jieba",
      "install @node-rs/jieba to improve Chinese search; falling back to whole-string tokenization",
    );
    return null;
  }
}

interface JaSegmenter {
  segment(text: string): string[];
}

let jaSegmenterInstance: JaSegmenter | null = null;
let jaSegmenterLoaded = false;

function getJaSegmenter(): JaSegmenter | null {
  if (jaSegmenterLoaded) return jaSegmenterInstance;
  jaSegmenterLoaded = true;
  try {
    const Ctor = cjkRequire("tiny-segmenter") as new () => JaSegmenter;
    jaSegmenterInstance = new Ctor();
    return jaSegmenterInstance;
  } catch {
    showHintOnce(
      "tiny-segmenter",
      "install tiny-segmenter to improve Japanese search; falling back to whole-string tokenization",
    );
    return null;
  }
}

function cleanTokens(tokens: string[]): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    const trimmed = t.trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}

function segmentHan(text: string): string[] {
  const j = getJieba();
  if (!j) return [text];
  try {
    return cleanTokens(j.cut(text, true));
  } catch {
    return [text];
  }
}

function segmentKana(text: string): string[] {
  const s = getJaSegmenter();
  if (!s) return [text];
  try {
    return cleanTokens(s.segment(text));
  } catch {
    return [text];
  }
}

function segmentHangul(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(HANGUL_BLOCK_RE)) {
    if (m[0]) out.push(m[0]);
  }
  return out;
}

export function segmentCjk(text: string): string[] {
  if (!hasCjk(text)) return [text];

  const out: string[] = [];
  let cursor = 0;

  for (const m of text.matchAll(CJK_RUN_RE)) {
    const start = m.index ?? 0;
    const run = m[0];
    const end = start + run.length;

    if (start > cursor) {
      const piece = text.slice(cursor, start).trim();
      if (piece) out.push(piece);
    }

    if (HANGUL_RE.test(run)) {
      out.push(...segmentHangul(run));
    } else if (KANA_RE.test(run)) {
      out.push(...segmentKana(run));
    } else {
      out.push(...segmentHan(run));
    }

    cursor = end;
  }

  if (cursor < text.length) {
    const trailing = text.slice(cursor).trim();
    if (trailing) out.push(trailing);
  }

  return out;
}

export function __resetCjkSegmenterStateForTests(): void {
  hintShown.clear();
  jiebaInstance = null;
  jiebaLoaded = false;
  jaSegmenterInstance = null;
  jaSegmenterLoaded = false;
}
