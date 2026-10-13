let transformersImportError: Error | undefined;

export function setTransformersImportError(error: Error): void {
  transformersImportError = error;
}

export function getTransformersImportError(): Error | undefined {
  return transformersImportError;
}

export function clearTransformersImportError(): void {
  transformersImportError = undefined;
}
