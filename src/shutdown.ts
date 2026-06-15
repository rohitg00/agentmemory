type ShutdownSdk = {
  shutdown: () => Promise<void>;
};

type ShutdownLogger = (...args: unknown[]) => void;

export type ShutdownSdkResult = "completed" | "timeout" | "errored";

export async function shutdownSdkWithTimeout(
  sdk: ShutdownSdk,
  {
    timeoutMs = 3000,
    warn = console.warn,
  }: { timeoutMs?: number; warn?: ShutdownLogger } = {},
): Promise<ShutdownSdkResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<"timeout">((resolve) => {
    timeout = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  const shutdownPromise = sdk.shutdown().then(
    () => "completed" as const,
    (err) => {
      warn(`[agentmemory] sdk.shutdown() errored:`, err);
      return "errored" as const;
    },
  );

  const result = await Promise.race([shutdownPromise, timeoutPromise]);
  if (timeout) clearTimeout(timeout);
  if (result === "timeout") {
    warn(
      `[agentmemory] sdk.shutdown() exceeded ${timeoutMs}ms timeout, proceeding to exit`,
    );
  }
  return result;
}
