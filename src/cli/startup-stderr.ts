export interface StartupStderrCapture {
  append(chunk: Buffer): void;
  text(): string;
}

export function createStartupStderrCapture(
  maxBytes = 16 * 1024,
): StartupStderrCapture {
  const chunks: Buffer[] = [];
  let capturedBytes = 0;

  return {
    append(chunk: Buffer): void {
      if (capturedBytes >= maxBytes) return;
      const slice = chunk.subarray(0, maxBytes - capturedBytes);
      chunks.push(slice);
      capturedBytes += slice.length;
    },
    text(): string {
      return Buffer.concat(chunks).toString("utf8");
    },
  };
}
