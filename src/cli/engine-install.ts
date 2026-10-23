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
  "0.24.6": {
    "iii-aarch64-apple-darwin.tar.gz": "1d50407ff5f0be161e6fc93b4c8c376bd92489ace7b288a62aeb60466d770e91",
    "iii-x86_64-apple-darwin.tar.gz": "920d1c2f9f5cfa29586c57596b0acf2fec427427a2855e388279b336be56117c",
    "iii-x86_64-unknown-linux-gnu.tar.gz": "ed6862004c85d75ecc09fd326578d6f6c7e8b4d8b639470dc126821fc070dd76",
    "iii-aarch64-unknown-linux-gnu.tar.gz": "77016727b951e5d0f985fbe77a6c878454c30480cc8051e77c478a8574287947",
    "iii-armv7-unknown-linux-gnueabihf.tar.gz": "7d5b8fe1733209914585d087c182accaaa88deceadfe42cac161f0f4160c5081",
    "iii-x86_64-pc-windows-msvc.zip": "ba121e7c11134614f4e3d69cebaefd945ed0c9b4d71518a543c7d76bc06f0784",
    "iii-aarch64-pc-windows-msvc.zip": "8f3c6b75ffc281146d964ce57b38f853c68355394bd8221380a93127b6b0985f",
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
