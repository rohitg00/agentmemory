import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export const III_INSTALL_CONNECT_TIMEOUT_S = 15;
export const III_INSTALL_MAX_TIME_S = 300;
export const III_INSTALL_SPAWN_TIMEOUT_MS =
  (III_INSTALL_CONNECT_TIMEOUT_S + III_INSTALL_MAX_TIME_S + 30) * 1000;

type ChecksumTable = Readonly<Record<string, Readonly<Record<string, string>>>>;

export const III_RELEASE_SHA256: ChecksumTable = {
  "0.22.1": {
    "iii-aarch64-apple-darwin.tar.gz": "2b309019b909a896cae874dc947e2cdf877b4f3c51dd026b79850af858517fa4",
    "iii-x86_64-apple-darwin.tar.gz": "6d33940db2d3ad6a9aef9837aa5b89bf5c5e4acd0679e8178fec258af229d7e1",
    "iii-x86_64-unknown-linux-gnu.tar.gz": "34d4bd2ec1873e6114bb836be7db9cb3f410d0d63353d240917f0bc9c30df13b",
    "iii-aarch64-unknown-linux-gnu.tar.gz": "87efc60210c1580ef2e11b13c679a4dad91917a9d80f737c5ba7e3475b3ca413",
    "iii-armv7-unknown-linux-gnueabihf.tar.gz": "af5dfc45149678c647e5adaca55c055428eebfa73d65884b052c30c98abcfd19",
    "iii-x86_64-pc-windows-msvc.zip": "d862bf7cf1e864f3290c8a6fc17c308c6ecac097cb2666e4a739efc0040aae96",
    "iii-aarch64-pc-windows-msvc.zip": "4777a48cee3fc1a742daee929e3d943df09e4ddd3357d27a33d31c9dc9e520ac",
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
