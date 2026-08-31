import { describe, it, expect } from "vitest";
import {
  extractLessonCandidates,
  isUsableLesson,
  MIN_LESSON_LENGTH,
  MAX_LESSON_LENGTH,
} from "../src/functions/replay.js";

describe("lesson extraction keeps whole sentences", () => {
  it("keeps the subject of the sentence, not just the clause after the trigger", () => {
    const text = "The watchdog must never restart on ROUTE_MISSING_404.";
    expect(extractLessonCandidates(text)).toEqual([
      "The watchdog must never restart on ROUTE_MISSING_404.",
    ]);
  });

  it("does not emit a clause that starts at the trigger word", () => {
    const text = "The watchdog must never restart on ROUTE_MISSING_404.";
    const lessons = extractLessonCandidates(text);
    expect(lessons.some((l) => l.startsWith("never restart"))).toBe(false);
  });

  it("picks only the sentences that state a rule", () => {
    const text =
      "I opened the file and looked around. Always run the migration before the backfill. " +
      "Then I went to lunch.";
    expect(extractLessonCandidates(text)).toEqual([
      "Always run the migration before the backfill.",
    ]);
  });

  it("finds a rule sentence in the middle of a paragraph", () => {
    const text =
      "We hit a timeout on the second attempt. Do not retry a write that has already " +
      "been acknowledged by the broker. That cost us an hour.";
    expect(extractLessonCandidates(text)).toEqual([
      "Do not retry a write that has already been acknowledged by the broker.",
    ]);
  });

  it("normalises internal whitespace", () => {
    const text = "Never   share\n a connection\tacross threads.";
    expect(extractLessonCandidates(text)).toEqual([
      "Never share a connection across threads.",
    ]);
  });

  it("returns nothing for text with no rule", () => {
    expect(extractLessonCandidates("I ran the tests and they passed.")).toEqual([]);
  });
});

describe("isUsableLesson rejects fragments", () => {
  it("rejects a clause that begins lowercase (its subject was discarded)", () => {
    expect(isUsableLesson("never restart on ROUTE_MISSING_404.")).toBe(false);
    expect(isUsableLesson("don't resurrect its framing anywhere.")).toBe(false);
  });

  it("accepts a whole sentence", () => {
    expect(isUsableLesson("Never restart the watchdog on a 404 response.")).toBe(true);
  });

  it("rejects a truncated tail with no terminal punctuation", () => {
    expect(
      isUsableLesson("Never convey meaning by color alone — pair it with"),
    ).toBe(false);
  });

  it("rejects unbalanced inline markup", () => {
    expect(isUsableLesson("Never push** to the shared branch directly.")).toBe(false);
    expect(isUsableLesson("Always call `flush before exiting the process.")).toBe(false);
    expect(isUsableLesson("Never edit [[some-page without locking it first.")).toBe(false);
  });

  it("accepts balanced inline markup", () => {
    expect(isUsableLesson("Always call `flush()` before exiting the process.")).toBe(true);
    expect(isUsableLesson("Never push **directly** to the shared branch.")).toBe(true);
  });

  it("rejects a trigger word that is part of an identifier, not prose", () => {
    expect(isUsableLesson("dont-repeat-yourself]]/some-page is the target.")).toBe(false);
    expect(isUsableLesson("Never-Ending-Story|never is a link alias here.")).toBe(false);
  });

  it("allows a sentence that legitimately opens with a code identifier", () => {
    expect(
      isUsableLesson("`retryAfter` must always be honoured before backing off."),
    ).toBe(true);
    expect(isUsableLesson("--dry-run must always be passed first.")).toBe(true);
  });

  it("enforces the length bounds", () => {
    expect(isUsableLesson("Never do.")).toBe(false); // under MIN_LESSON_LENGTH
    const tooLong = "Never " + "x".repeat(MAX_LESSON_LENGTH) + ".";
    expect(tooLong.length).toBeGreaterThan(MAX_LESSON_LENGTH);
    expect(isUsableLesson(tooLong)).toBe(false);
    expect(MIN_LESSON_LENGTH).toBeLessThan(MAX_LESSON_LENGTH);
  });

  it("requires a trigger word at all", () => {
    expect(isUsableLesson("The build completed in four minutes.")).toBe(false);
  });
});

describe("regression: the shapes seen in a real store", () => {
  // Verbatim fragments produced by the previous match-from-trigger behaviour.
  // Shapes, not content: each exhibits one way the old matcher cut a sentence.
  const observedFragments = [
    "don't resurrect its framing.", //            lowercase opening
    "never in production or on every launch.", // lowercase opening
    "never rounded, never paraphrased, never", // opening + no terminal punctuation
    "don't change, so NOT on the cadence.", //    lowercase opening
    "never pushed**); unbalanced", //             opening + odd ** + no terminator
    "do not bulk-convert.", //                    lowercase opening
    "always call `flush before you exit.", //     opening + odd backtick
  ];

  it("rejects every one of them", () => {
    for (const f of observedFragments) {
      expect(isUsableLesson(f), `should reject: ${f}`).toBe(false);
    }
  });

  // Sentences that were captured correctly because the trigger happened to be
  // sentence-initial. These must keep working.
  const observedGoodLessons = [
    "Never archive a record before its transcript is written (older ones are exempt).",
    "Do not fetch or save in lifecycle hooks.",
    "Never half-do destructive work; never leave the task without a terminal comment.",
  ];

  it("still accepts the ones that were already good", () => {
    for (const g of observedGoodLessons) {
      expect(isUsableLesson(g), `should accept: ${g}`).toBe(true);
    }
  });
});

describe("the old match-from-trigger behaviour, for contrast", () => {
  // The previous implementation stored the regex MATCH as the lesson. Kept here
  // so the defect is visible without leaving the test file: the same sentence
  // produces a subject-less clause under the old approach, and the new gate
  // rejects exactly that output.
  const OLD_PATTERN =
    /\b(always|never|don'?t|do not|make sure|remember to|note:|caveat:|warning:)\b[^.\n]{10,200}[.!\n]/gi;

  const sentence = "The watchdog must never restart on ROUTE_MISSING_404.";

  it("dropped the subject, inverting the rule", () => {
    OLD_PATTERN.lastIndex = 0;
    const match = OLD_PATTERN.exec(sentence);
    expect(match?.[0].trim()).toBe("never restart on ROUTE_MISSING_404.");
  });

  it("and its output is what the new gate rejects", () => {
    OLD_PATTERN.lastIndex = 0;
    const oldOutput = OLD_PATTERN.exec(sentence)![0].trim();
    expect(isUsableLesson(oldOutput)).toBe(false);
    expect(extractLessonCandidates(sentence)).toEqual([sentence]);
  });
});
