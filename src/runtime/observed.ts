import type { IIIClient } from "iii-sdk";

type ObservedField = "input" | "output";

function isObserved(payload: unknown): payload is { input?: unknown; output?: unknown } {
  return typeof payload === "object" && payload !== null &&
    typeof (payload as { observer_id?: unknown }).observer_id === "string" &&
    typeof (payload as { activation_id?: unknown }).activation_id === "string";
}

export function unwrapObserved<T>(payload: unknown, field: ObservedField): T {
  return (isObserved(payload) ? payload[field] : payload) as T;
}

export function registerObserverTarget<T, R>(
  sdk: IIIClient,
  functionId: string,
  field: ObservedField,
  handler: (payload: T) => R | Promise<R>,
): void {
  sdk.registerFunction(functionId, (payload: unknown) => handler(unwrapObserved<T>(payload, field)));
}
