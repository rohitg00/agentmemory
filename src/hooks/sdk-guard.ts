export function isSdkChildContext(payload: unknown): boolean {
  if (process.env.AGENTMEMORY_SDK_CHILD === "1") return true;
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if (p["entrypoint"] === "sdk-ts") return true;
  return false;
}
