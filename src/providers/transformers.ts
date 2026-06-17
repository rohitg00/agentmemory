export type TransformersModule = {
  env?: {
    backends?: {
      onnx?: {
        wasm?: {
          numThreads?: number;
        };
      };
    };
  };
  pipeline: unknown;
  RawImage?: {
    fromBlob: (blob: Blob) => Promise<unknown>;
  };
};

export async function loadTransformers<
  T extends TransformersModule = TransformersModule,
>(): Promise<T> {
  const transformers = (await import("@xenova/transformers")) as TransformersModule;
  configureTransformersForNode(transformers);
  return transformers as T;
}

export function configureTransformersForNode(
  transformers: TransformersModule,
): void {
  if (typeof process === "undefined" || process.release?.name !== "node") {
    return;
  }

  const wasm = transformers.env?.backends?.onnx?.wasm;
  if (!wasm) return;

  wasm.numThreads = 1;
}
