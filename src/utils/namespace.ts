export function normalizeNamespace(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 128);
}

export function makeProjectProfileKey(
  project: string,
  namespace?: string,
): string {
  return namespace ? `ns:${namespace}::${project}` : project;
}
