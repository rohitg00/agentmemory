import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const III_INSTALL_CONNECT_TIMEOUT_S = 15;
export const III_INSTALL_MAX_TIME_S = 300;
export const III_INSTALL_SPAWN_TIMEOUT_MS =
  (III_INSTALL_CONNECT_TIMEOUT_S + III_INSTALL_MAX_TIME_S + 30) * 1000;

type ChecksumTable = Readonly<Record<string, Readonly<Record<string, string>>>>;

export const III_RELEASE_SHA256: ChecksumTable = {
  "0.25.0": {
    "iii-aarch64-apple-darwin.tar.gz": "5f23087a41ce1cf86f9859d2f430d1809a1e048094e69b1df0cdf1ebefc2a985",
    "iii-x86_64-apple-darwin.tar.gz": "e2ac4ef109ddbf459b4683171c6b5b9c8366b16dac2e1f8c4fe08b4a4e19d49a",
    "iii-x86_64-unknown-linux-gnu.tar.gz": "4c4d14063eb55d79663db553e960497731420df6d78eca3aafe670e2fbaba8e2",
    "iii-aarch64-unknown-linux-gnu.tar.gz": "5e52d4738a0beb609f4d32970d37be7c00d4848ee9d06300248498a00ea4bf0e",
    "iii-armv7-unknown-linux-gnueabihf.tar.gz": "9ee840351ff62c889b929b618f8cbb2d66d616cecf82cde7c26d4618aa137508",
    "iii-x86_64-pc-windows-msvc.zip": "b80ea5c3408879380b6ce95f7b2855ce161d68642aeec8f7b54f104794cbb322",
    "iii-aarch64-pc-windows-msvc.zip": "2b1e222b90ee18ed143186e8b307d8ad2076f44ea00fa7a7d071bd3c87cde002",
  },
};

export function expectedIiiSha256(
  version: string,
  asset: string,
  checksums: ChecksumTable = III_RELEASE_SHA256,
): string | null {
  return checksums[version]?.[asset] ?? null;
}

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function curlTimeoutFlags(): string {
  return `--connect-timeout ${III_INSTALL_CONNECT_TIMEOUT_S} --max-time ${III_INSTALL_MAX_TIME_S}`;
}

export function iiiArchivePath(binDir: string): string {
  return join(binDir, ".iii-download.tar.gz");
}

export function iiiDownloadShellCommand(): string {
  return `mkdir -p "$2" && rm -f "$3" && if curl -fsSL ${curlTimeoutFlags()} -o "$3" "$1"; then :; else code=$?; rm -f "$3"; exit $code; fi`;
}

export function iiiExtractShellCommand(): string {
  return 'if tar -xzf "$1" -C "$2"; then rm -f "$1"; else code=$?; rm -f "$1"; exit $code; fi && chmod +x "$3"';
}

export function iiiManualInstallCommand(
  releaseUrl: string,
  binDir: string,
  binPath: string,
  sha256: string | null,
): string {
  const verify = sha256
    ? ` && printf '%s  %s\\n' "${sha256}" "$archive" | { sha256sum -c - 2>/dev/null || shasum -a 256 -c -; }`
    : "";
  return `mkdir -p "${binDir}" && archive="$(mktemp "${binDir}/.iii-download.XXXXXX")" && { curl -fL --connect-timeout ${III_INSTALL_CONNECT_TIMEOUT_S} -o "$archive" "${releaseUrl}"${verify} && tar -xzf "$archive" -C "${binDir}"; code=$?; rm -f "$archive"; (exit $code); } && chmod +x "${binPath}"`;
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

export type IiiInstallOutcome =
  | { ok: true }
  | { ok: false; reason: "no-checksum" | "download" | "checksum" | "extract"; detail: string };

export function installIiiArchive(opts: {
  sh: string;
  releaseUrl: string;
  version: string;
  asset: string;
  binDir: string;
  binPath: string;
  env?: NodeJS.ProcessEnv;
  checksums?: ChecksumTable;
}): IiiInstallOutcome {
  const expected = expectedIiiSha256(opts.version, opts.asset, opts.checksums);
  if (!expected) {
    return {
      ok: false,
      reason: "no-checksum",
      detail: `no pinned SHA-256 for ${opts.asset} in iii v${opts.version}, so the download cannot be verified`,
    };
  }
  const run = (script: string, args: string[]) =>
    spawnSync(opts.sh, ["-c", script, "sh", ...args], {
      stdio: "pipe",
      encoding: "utf-8",
      timeout: III_INSTALL_SPAWN_TIMEOUT_MS,
      env: opts.env ?? process.env,
    });

  const archive = iiiArchivePath(opts.binDir);
  const download = run(iiiDownloadShellCommand(), [opts.releaseUrl, opts.binDir, archive]);
  if (download.status !== 0) {
    return { ok: false, reason: "download", detail: describeInstallFailure(download) };
  }

  let actual: string;
  try {
    actual = sha256File(archive);
  } catch (err) {
    rmSync(archive, { force: true });
    return { ok: false, reason: "download", detail: err instanceof Error ? err.message : String(err) };
  }
  if (actual !== expected) {
    rmSync(archive, { force: true });
    return {
      ok: false,
      reason: "checksum",
      detail: `SHA-256 mismatch for ${opts.asset}: expected ${expected}, got ${actual}. The download was deleted and nothing was installed`,
    };
  }

  const extract = run(iiiExtractShellCommand(), [archive, opts.binDir, opts.binPath]);
  if (extract.status !== 0) {
    return { ok: false, reason: "extract", detail: describeInstallFailure(extract) };
  }
  return { ok: true };
}

export type ZipRunResult = {
  status: number | null;
  stdout?: string | null;
  stderr?: string | null;
  error?: Error & { code?: string };
  signal?: NodeJS.Signals | null;
};

export type ZipCommandRunner = (command: string, args: string[]) => ZipRunResult;

export type ZipDownloader = (url: string, dest: string) => Promise<void>;

export function iiiZipArchivePath(binDir: string): string {
  return join(binDir, ".iii-download.zip");
}

export function powershellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function windowsZipExtractCommands(
  archive: string,
  binDir: string,
  env: NodeJS.ProcessEnv = process.env,
): { command: string; args: string[] }[] {
  const systemRoot = env["SystemRoot"] || env["SYSTEMROOT"] || "C:\\Windows";
  const system32 = join(systemRoot, "System32");
  return [
    { command: join(system32, "tar.exe"), args: ["-xf", archive, "-C", binDir] },
    {
      command: join(system32, "WindowsPowerShell", "v1.0", "powershell.exe"),
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Expand-Archive -LiteralPath ${powershellLiteral(archive)} -DestinationPath ${powershellLiteral(binDir)} -Force`,
      ],
    },
  ];
}

export async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(III_INSTALL_MAX_TIME_S * 1000),
  });
  if (!res.ok) throw new Error(`download failed with HTTP ${res.status} ${res.statusText}`.trim());
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function defaultZipRunner(command: string, args: string[]): ZipRunResult {
  return spawnSync(command, args, {
    stdio: "pipe",
    encoding: "utf-8",
    timeout: III_INSTALL_SPAWN_TIMEOUT_MS,
    windowsHide: true,
    shell: false,
  });
}

export async function installIiiZip(opts: {
  releaseUrl: string;
  version: string;
  asset: string;
  binDir: string;
  binPath: string;
  env?: NodeJS.ProcessEnv;
  checksums?: ChecksumTable;
  download?: ZipDownloader;
  run?: ZipCommandRunner;
}): Promise<IiiInstallOutcome> {
  const expected = expectedIiiSha256(opts.version, opts.asset, opts.checksums);
  if (!expected) {
    return {
      ok: false,
      reason: "no-checksum",
      detail: `no pinned SHA-256 for ${opts.asset} in iii v${opts.version}, so the download cannot be verified`,
    };
  }
  const download = opts.download ?? downloadToFile;
  const run = opts.run ?? defaultZipRunner;
  const archive = iiiZipArchivePath(opts.binDir);

  try {
    mkdirSync(opts.binDir, { recursive: true });
    rmSync(archive, { force: true });
    await download(opts.releaseUrl, archive);
  } catch (err) {
    rmSync(archive, { force: true });
    return { ok: false, reason: "download", detail: err instanceof Error ? err.message : String(err) };
  }

  let actual: string;
  try {
    actual = sha256File(archive);
  } catch (err) {
    rmSync(archive, { force: true });
    return { ok: false, reason: "download", detail: err instanceof Error ? err.message : String(err) };
  }
  if (actual !== expected) {
    rmSync(archive, { force: true });
    return {
      ok: false,
      reason: "checksum",
      detail: `SHA-256 mismatch for ${opts.asset}: expected ${expected}, got ${actual}. The download was deleted and nothing was installed`,
    };
  }

  const failures: string[] = [];
  for (const step of windowsZipExtractCommands(archive, opts.binDir, opts.env)) {
    const result = run(step.command, step.args);
    if (result.status === 0 && existsSync(opts.binPath)) {
      rmSync(archive, { force: true });
      return { ok: true };
    }
    failures.push(`${step.command}: ${result.status === 0 ? `finished but ${opts.binPath} is missing` : describeInstallFailure(result)}`);
  }
  rmSync(archive, { force: true });
  return { ok: false, reason: "extract", detail: failures.join("; ") };
}
