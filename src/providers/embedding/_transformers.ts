import { homedir } from "node:os";
import { join } from "node:path";
import type * as TransformersType from "@huggingface/transformers";

function isDirectTransformersModuleNotFound(err: unknown): err is Error {
  return (
    err instanceof Error &&
    (err as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" &&
    /^(?:Cannot find package|Cannot find module) (['"])@huggingface\/transformers\1(?:$|\n| imported from )/.test(
      err.message,
    )
  );
}

export async function loadTransformers(
  purpose = "local embeddings",
): Promise<typeof TransformersType> {
  let transformers: any;
  try {
    transformers = await import("@huggingface/transformers");
  } catch (err) {
    if (isDirectTransformersModuleNotFound(err)) {
      throw new Error(
        `Install @huggingface/transformers for ${purpose}: npm install @huggingface/transformers`,
        { cause: err },
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
  }
  return transformers;
}
