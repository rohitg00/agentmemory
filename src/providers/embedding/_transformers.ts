import { homedir } from "node:os";
import { join } from "node:path";
import type * as TransformersType from "@huggingface/transformers";

export async function loadTransformers(
  purpose = "local embeddings",
): Promise<typeof TransformersType> {
  let transformers: any;
  try {
    transformers = await import("@huggingface/transformers");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
      throw new Error(
        `Install @huggingface/transformers for ${purpose}: npm install @huggingface/transformers`,
      );
    }
    throw err;
  }
  try {
    if (transformers && "env" in transformers && transformers.env) {
      transformers.env.cacheDir =
        process.env.TRANSFORMERS_CACHE ||
        process.env.HF_HOME ||
        join(homedir(), ".cache", "huggingface", "transformers");
    }
  } catch {
    // Ignore when env is omitted in mock environments
  }
  return transformers;
}
