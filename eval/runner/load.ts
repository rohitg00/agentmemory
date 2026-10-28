import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { Question, Session } from "./types.js";

const nonempty = z.string().trim().min(1);
const rawRow = z.object({
  question_id: nonempty,
  question_type: nonempty,
  question: nonempty,
  answer: z.union([z.string(), z.number()]).optional(),
  question_date: nonempty.optional(),
  answer_session_ids: z.array(nonempty),
  haystack_session_ids: z.array(nonempty),
  haystack_dates: z.array(nonempty).optional(),
  haystack_sessions: z.array(z.array(z.object({ role: nonempty, content: z.string() }))),
});

export function opaqueSessionId(namespace: string, id: string): string {
  return "session_" + createHash("sha256").update(JSON.stringify([namespace, id])).digest("hex").slice(0, 24);
}

const questionSchema = z.object({
  id: nonempty, type: nonempty, question: nonempty, answer: z.string().optional(),
  timestamp: nonempty.optional(), answerability: z.enum(["answerable", "unanswerable"]).default("answerable"),
  goldSessionIds: z.array(nonempty), coalescedSources: z.number().int().nonnegative().optional(),
  haystack: z.array(z.object({ id: nonempty, content: z.string(), timestamp: nonempty.optional() })).min(1),
});

export function validateQuestion(input: Question): Question {
  const q = questionSchema.parse(input);
  if (q.answerability === "answerable" && !q.goldSessionIds.length) {
    throw new Error("Answerable question has no gold sessions: " + q.id);
  }
  if (q.answerability === "unanswerable" && q.goldSessionIds.length) {
    throw new Error("Unanswerable question must not have gold sessions: " + q.id);
  }
  if (new Set(q.goldSessionIds).size !== q.goldSessionIds.length) throw new Error("Duplicate gold session in " + q.id);
  const sessions = new Set(q.haystack.map((session) => session.id));
  if (sessions.size !== q.haystack.length) throw new Error("Duplicate session ID in " + q.id);
  if (q.goldSessionIds.some((id) => !sessions.has(id))) throw new Error("Gold session is absent from haystack in " + q.id);
  return q;
}

export function isolateQuestion(input: Question): Question {
  const q = validateQuestion(input);
  const mapping = new Map(q.haystack.map((s) => [s.id, opaqueSessionId(q.id, s.id)]));
  return {
    ...q,
    goldSessionIds: [...new Set(q.goldSessionIds)].map((id) => mapping.get(id)!),
    haystack: q.haystack.map((s) => ({ id: mapping.get(s.id)!, content: s.content, timestamp: s.timestamp })),
  };
}

function coalesceRepeatedSources(sessions: Session[]): Session[] {
  const sources = new Map<string, { session: Session; dates: Set<string> }>();
  for (const session of sessions) {
    const existing = sources.get(session.id);
    if (existing && existing.session.content !== session.content) {
      throw new Error("Conflicting transcripts for repeated session ID");
    }
    const source = existing ?? { session, dates: new Set<string>() };
    if (session.timestamp) source.dates.add(session.timestamp);
    sources.set(session.id, source);
  }
  return [...sources.values()].map(({ session, dates }) => ({
    ...session,
    content: [...dates].slice(1).map((date) => "[Additional source session date: " + date + "]\n").join("") + session.content,
  }));
}

export function loadLongMemEval(path: string, limit?: number): Question[] {
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) throw new Error("limit must be positive");
  const raw = z.array(rawRow).parse(JSON.parse(readFileSync(path, "utf8")));
  const seen = new Set<string>();
  const questions = raw.map((r): Question => {
    if (seen.has(r.question_id)) throw new Error("Duplicate question ID: " + r.question_id);
    seen.add(r.question_id);
    if (r.haystack_session_ids.length !== r.haystack_sessions.length ||
        (r.haystack_dates && r.haystack_dates.length !== r.haystack_sessions.length)) {
      throw new Error("LongMemEval row " + r.question_id + ": session/date length mismatch");
    }
    const unanswerable = r.question_id.endsWith("_abs");
    if (!unanswerable && r.answer_session_ids.length === 0) {
      throw new Error("Answerable question has no gold sessions: " + r.question_id);
    }
    const haystack: Session[] = r.haystack_session_ids.map((id, i) => ({
      id,
      timestamp: r.haystack_dates?.[i],
      content: r.haystack_sessions[i].map((t) => "[" + t.role + "] " + t.content).join("\n\n"),
    }));
    const normalized = coalesceRepeatedSources(haystack);
    return isolateQuestion({
      id: r.question_id,
      type: r.question_type,
      question: r.question,
      answer: r.answer === undefined ? undefined : String(r.answer),
      timestamp: r.question_date,
      answerability: unanswerable ? "unanswerable" : "answerable",
      goldSessionIds: unanswerable ? [] : r.answer_session_ids,
      haystack: normalized,
      coalescedSources: haystack.length - normalized.length,
    });
  });
  return limit === undefined ? questions : questions.slice(0, limit);
}

export function stratifySample(questions: Question[], perType: number): Question[] {
  if (!Number.isInteger(perType) || perType <= 0) throw new Error("perType must be positive");
  const buckets: Record<string, Question[]> = {};
  for (const q of questions) (buckets[q.type] ??= []).push(q);
  return Object.keys(buckets).sort().flatMap((type) => buckets[type].slice(0, perType));
}
