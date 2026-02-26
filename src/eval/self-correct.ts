import type { MemoryProvider } from "../types.js";

const STRICTER_SUFFIX = `

IMPORTANT: Your previous response was invalid. Please ensure your output strictly follows the required XML format. Every required field must be present with valid values.`;

export async function compressWithRetry(
  provider: MemoryProvider,
  systemPrompt: string,
  userPrompt: string,
  validator: (response: string) => { valid: boolean; errors?: string[] },
  maxRetries = 1,
): Promise<{ response: string; retried: boolean }> {
  const first = await provider.compress(systemPrompt, userPrompt);
  const result = validator(first);
  if (result.valid) return { response: first, retried: false };

  for (let i = 0; i < maxRetries; i++) {
    const retry = await provider.compress(
      systemPrompt + STRICTER_SUFFIX,
      userPrompt,
    );
    const retryResult = validator(retry);
    if (retryResult.valid) return { response: retry, retried: true };
  }

  return { response: first, retried: true };
}
