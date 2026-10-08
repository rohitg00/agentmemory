export function embeddingStatusLabel(provider: unknown): string | null {
  if (typeof provider !== "string") return null;
  const value = provider.trim();
  return value && value !== "none" ? value : null;
}
