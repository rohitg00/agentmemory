export function agentmemoryAuthHeaders(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const secret = env["AGENTMEMORY_SECRET"]?.trim();
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

export function agentmemoryJsonHeaders(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...agentmemoryAuthHeaders(env),
  };
}
