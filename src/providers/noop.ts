import type { MemoryProvider } from "../types.js";

export function isNoopProvider(provider: { name: string }): boolean {
  return provider.name === "noop" || provider.name === "resilient(noop)";
}

export class NoopProvider implements MemoryProvider {
  name = "noop";

  async compress(): Promise<string> {
    return "";
  }

  async summarize(): Promise<string> {
    return "";
  }
}
