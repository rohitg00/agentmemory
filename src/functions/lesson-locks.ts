import { withKeyedLock } from "../state/keyed-mutex.js";

const LESSON_MUTATION_LOCK = "mem:lessons:mutation";

function lessonLockKey(lessonId: string): string {
  return `mem:lesson:${lessonId}`;
}

export function withLessonMutationLock<T>(
  fn: () => Promise<T>,
): Promise<T> {
  return withKeyedLock(LESSON_MUTATION_LOCK, fn);
}

export function withLessonLocks<T>(
  lessonIds: string[],
  fn: () => Promise<T>,
): Promise<T> {
  return withLessonMutationLock(() => {
    const orderedIds = [...new Set(lessonIds)].sort();
    const lockNext = (index: number): Promise<T> => {
      if (index >= orderedIds.length) return fn();
      return withKeyedLock(lessonLockKey(orderedIds[index]), () =>
        lockNext(index + 1),
      );
    };
    return lockNext(0);
  });
}
