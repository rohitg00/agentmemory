import type { MemoryProvider } from "../types.js";

export class FallbackChainProvider implements MemoryProvider {
  name: string;

  constructor(private providers: MemoryProvider[]) {
    this.name = `fallback(${providers.map((p) => p.name).join(" -> ")})`;
  }

  async compress(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.tryAll((p) => p.compress(systemPrompt, userPrompt));
  }

  async summarize(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.tryAll((p) => p.summarize(systemPrompt, userPrompt));
  }

  private async tryAll(
    fn: (p: MemoryProvider) => Promise<string>,
  ): Promise<string> {
    let lastError: Error | null = null;
    for (const provider of this.providers) {
      try {
        return await fn(provider);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    throw lastError || new Error("No providers available");
  }
}
