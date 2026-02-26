import type { z } from "zod";
import type { EvalResult } from "../types.js";

export function validateInput<T>(
  schema: z.ZodType<T>,
  data: unknown,
  functionId: string,
): { valid: true; data: T } | { valid: false; result: EvalResult } {
  const parsed = schema.safeParse(data);
  if (parsed.success) {
    return { valid: true, data: parsed.data };
  }
  return {
    valid: false,
    result: {
      valid: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      qualityScore: 0,
      latencyMs: 0,
      functionId,
    },
  };
}

export function validateOutput<T>(
  schema: z.ZodType<T>,
  data: unknown,
  functionId: string,
): { valid: true; data: T } | { valid: false; result: EvalResult } {
  return validateInput(schema, data, functionId);
}
