export const III_INSTALL_CONNECT_TIMEOUT_S = 15;
export const III_INSTALL_MAX_TIME_S = 300;
export const III_INSTALL_SPAWN_TIMEOUT_MS =
  (III_INSTALL_CONNECT_TIMEOUT_S + III_INSTALL_MAX_TIME_S + 30) * 1000;

function curlTimeoutFlags(): string {
  return `--connect-timeout ${III_INSTALL_CONNECT_TIMEOUT_S} --max-time ${III_INSTALL_MAX_TIME_S}`;
}

export function iiiInstallShellCommand(
  releaseUrl: string,
  binDir: string,
  binPath: string,
): string {
  const archive = `${binDir}/.iii-download.tar.gz`;
  return [
    `mkdir -p "${binDir}"`,
    `rm -f "${archive}"`,
    `if curl -fsSL ${curlTimeoutFlags()} -o "${archive}" "${releaseUrl}" && tar -xzf "${archive}" -C "${binDir}"; then rm -f "${archive}"; else code=$?; rm -f "${archive}"; exit $code; fi`,
    `chmod +x "${binPath}"`,
  ].join(" && ");
}

export function iiiManualInstallCommand(
  releaseUrl: string,
  binDir: string,
  binPath: string,
): string {
  return `mkdir -p "${binDir}" && archive="$(mktemp "${binDir}/.iii-download.XXXXXX")" && { curl -fL --connect-timeout ${III_INSTALL_CONNECT_TIMEOUT_S} -o "$archive" "${releaseUrl}" && tar -xzf "$archive" -C "${binDir}"; code=$?; rm -f "$archive"; (exit $code); } && chmod +x "${binPath}"`;
}

export function describeInstallFailure(result: {
  error?: Error & { code?: string };
  signal?: NodeJS.Signals | null;
  status?: number | null;
  stderr?: string | null;
  stdout?: string | null;
}): string {
  if (result.error?.code === "ETIMEDOUT") {
    return `timed out after ${Math.round(III_INSTALL_SPAWN_TIMEOUT_MS / 1000)} s`;
  }
  const output = (result.stderr || result.stdout || "").toString().trim();
  if (output) return output;
  if (result.status === 28) {
    return `download timed out (no connection within ${III_INSTALL_CONNECT_TIMEOUT_S} s or not finished within ${III_INSTALL_MAX_TIME_S} s)`;
  }
  if (result.signal) return `installer stopped by ${result.signal}`;
  if (result.error) return result.error.message;
  return `installer exited with status ${result.status ?? "unknown"}`;
}
