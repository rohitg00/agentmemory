import type { MemoryProvider } from "../types.js";

const STRICTER_SUFFIX = `

IMPORTANT: Your previous response was invalid. Please ensure your output strictly follows the required XML format. Every required field must be present with valid values.`;

type ValidationResult<T> =
  | { valid: true; data: T }
  | { valid: false; errors?: string[] };

export async function compressWithRetry<T>(
  provider: MemoryProvider,
  systemPrompt: string,
  userPrompt: string,
  validator: (response: string) => ValidationResult<T>,
  maxRetries = 1,
): Promise<ValidationResult<T> & { retried: boolean }> {
  const first = await provider.compress(systemPrompt, userPrompt);
  let result = validator(first);
  if (result.valid) return { ...result, retried: false };

  let retried = false;
  for (let i = 0; i < maxRetries; i++) {
    retried = true;
    const retry = await provider.compress(
      systemPrompt + STRICTER_SUFFIX,
      userPrompt,
    );
    result = validator(retry);
    if (result.valid) return { ...result, retried };
  }

  return { ...result, retried };
}
