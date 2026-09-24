export const SHUTDOWN_FLUSH_TIMEOUT_MS = 4000;
export const SHUTDOWN_HARD_EXIT_MS = 8000;

export async function settleWithin(
  work: Promise<unknown>,
  ms: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([work.then(() => true), expiry]);
  } finally {
    clearTimeout(timer);
  }
}
