import type { MemoryProvider } from "../types.js";

type ImageProvider = MemoryProvider &
  Required<Pick<MemoryProvider, "describeImage">>;

export class FallbackChainProvider implements MemoryProvider {
  name: string;
  declare readonly describeImage?: MemoryProvider["describeImage"];

  constructor(private providers: MemoryProvider[]) {
    this.name = `fallback(${providers.map((p) => p.name).join(" -> ")})`;
    const imageProviders = providers.filter(
      (provider): provider is ImageProvider =>
        typeof provider.describeImage === "function",
    );
    if (imageProviders.length > 0) {
      this.describeImage = (imageData, mimeType, prompt) =>
        this.tryAll(
          (provider) => provider.describeImage(imageData, mimeType, prompt),
          imageProviders,
        );
    }
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.tryAll((p) => p.compress(systemPrompt, userPrompt), this.providers);
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.tryAll((p) => p.summarize(systemPrompt, userPrompt), this.providers);
  }

  private async tryAll<T extends MemoryProvider>(
    fn: (p: T) => Promise<string>,
    providers: T[],
  ): Promise<string> {
    let lastError: Error | null = null;
    for (const provider of providers) {
      try {
        return await fn(provider);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    throw lastError || new Error("No providers available");
  }
}
