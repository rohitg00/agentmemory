import { readFileSync } from "node:fs";
import type { Question, Session } from "./types.js";

interface LongMemEvalRaw {
  question_id: string;
  question_type: string;
  question: string;
  answer?: string;
  answer_session_ids: string[];
  haystack_session_ids: string[];
  haystack_sessions: Array<Array<{ role: string; content: string }>>;
}

function flattenSession(turns: Array<{ role: string; content: string }>): string {
  return turns.map((t) => `[${t.role}] ${t.content}`).join("\n\n");
}

export function loadLongMemEval(path: string, limit?: number): Question[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as LongMemEvalRaw[];
  const slice = typeof limit === "number" ? raw.slice(0, limit) : raw;
  const questions: Question[] = [];
  for (const r of slice) {
    if (r.haystack_session_ids.length !== r.haystack_sessions.length) {
      throw new Error(
        `LongMemEval row ${r.question_id}: haystack_session_ids (${r.haystack_session_ids.length}) and haystack_sessions (${r.haystack_sessions.length}) length mismatch`,
      );
    }
    const haystack: Session[] = r.haystack_session_ids.map((id, i) => ({
      id,
      content: flattenSession(r.haystack_sessions[i]),
    }));
    questions.push({
      id: r.question_id,
      type: r.question_type,
      question: r.question,
      answer: r.answer,
      goldSessionIds: r.answer_session_ids,
      haystack,
    });
  }
  return questions;
}

export function stratifySample(questions: Question[], perType: number): Question[] {
  const buckets: Record<string, Question[]> = {};
  for (const q of questions) {
    (buckets[q.type] ??= []).push(q);
  }
  const out: Question[] = [];
  for (const type of Object.keys(buckets).sort()) {
    out.push(...buckets[type].slice(0, perType));
  }
  return out;
}
