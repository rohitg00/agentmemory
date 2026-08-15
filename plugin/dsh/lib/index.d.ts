export interface PluginContext {
  on(event: string, listener: (...args: any[]) => unknown): void;
  effect(callback: () => void | (() => void), label?: string): void;
  logger: { info(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void };
}

export interface SessionLike {
  id: string;
  header?: { cwd?: string };
}

// Event payloads vary by event type; consumers narrow data at runtime.
export interface SessionEvent {
  type: string;
  seq?: number;
  data: any;
}

export interface AgentmemoryConfig {
  url: string;
  secret: string;
  agentId: string;
  injectInstructions: boolean;
  injectContext: boolean;
  injectMaxChars: number;
  observeToolCalls: boolean;
  compactionBridge: boolean;
  summarizeOnDispose: boolean;
}

export interface RestClient {
  post<T>(path: string, body: Record<string, unknown>, timeoutMs?: number): Promise<T | null>;
  fire(path: string, body: Record<string, unknown>, timeoutMs?: number): void;
}

export function makeRestClient(url: string, secret: string, debug?: boolean): RestClient;
export function resolveProjectName(cwd: string, env?: Record<string, string | undefined>): string;
export function isAgentmemoryTool(name: string): boolean;
export function eventTextContent(content: unknown): string;
export function userMessagePrompt(event: SessionEvent, maxChars: number): string | null;
export function toolCallObservation(event: SessionEvent, maxChars: number): Record<string, unknown> | null;
export function compactionSummary(event: SessionEvent, maxChars: number): string | null;

export const name: string;
export function apply(ctx: PluginContext, config?: Partial<AgentmemoryConfig>): void;
