import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

export const III_INSTALL_CONNECT_TIMEOUT_S = 15;
export const III_INSTALL_MAX_TIME_S = 300;
export const III_INSTALL_RETRIES = 3;
export const III_INSTALL_RETRY_DELAY_S = 2;
export const III_INSTALL_RETRY_MAX_TIME_S = 120;
export const III_INSTALL_SPAWN_TIMEOUT_MS =
  (III_INSTALL_CONNECT_TIMEOUT_S + III_INSTALL_MAX_TIME_S + III_INSTALL_RETRY_MAX_TIME_S + 30) * 1000;
const RETRYABLE_HTTP_STATUS = new Set([408, 429, 500, 502, 503, 504]);

type ChecksumTable = Readonly<Record<string, Readonly<Record<string, string>>>>;

export const III_RELEASE_SHA256: ChecksumTable = {
  "0.25.1": {
    "iii-aarch64-apple-darwin.tar.gz": "f7eff803540436a4964958048abc0083e638f53b500d737819f62913c270f141",
    "iii-x86_64-apple-darwin.tar.gz": "d93511a72336c19a6028a18f43819e6b3c49522589fc6303f0a0880b3f02d8ae",
    "iii-x86_64-unknown-linux-gnu.tar.gz": "0f486f0fb175013fdebd482735228a47de5fd5014d375a9720cb4f958341208a",
    "iii-aarch64-unknown-linux-gnu.tar.gz": "5938c6d2f25df8e301c058ef0bcfc9f858840c8b77d3eff1fa1bc83f67bd136c",
    "iii-armv7-unknown-linux-gnueabihf.tar.gz": "d872197aa19312e84250ee40eb38a6d225600939bc2aaaac04a91d2671c47f14",
    "iii-x86_64-pc-windows-msvc.zip": "a4648976760d76a8c7c457b36256d3381cd4a0332c288f2b434fe2b2d02d746a",
    "iii-aarch64-pc-windows-msvc.zip": "f2ef00b6363cfb97d31f7356cce88ea0771b8fa0e8e5bbd561c0210337b83b64",
  },
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
  return `--connect-timeout ${III_INSTALL_CONNECT_TIMEOUT_S} --max-time ${III_INSTALL_MAX_TIME_S} ${curlRetryFlags()}`;
}

function curlRetryFlags(): string {
  return `--retry ${III_INSTALL_RETRIES} --retry-delay ${III_INSTALL_RETRY_DELAY_S} --retry-max-time ${III_INSTALL_RETRY_MAX_TIME_S}`;
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
  return `mkdir -p "${binDir}" && archive="$(mktemp "${binDir}/.iii-download.XXXXXX")" && { curl -fL --connect-timeout ${III_INSTALL_CONNECT_TIMEOUT_S} ${curlRetryFlags()} -o "$archive" "${releaseUrl}"${verify} && tar -xzf "$archive" -C "${binDir}"; code=$?; rm -f "$archive"; (exit $code); } && chmod +x "${binPath}"`;
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

export type ZipCommandRunner = (command: string, args: string[]) => ZipRunResult | Promise<ZipRunResult>;

export type ZipDownloader = (url: string, dest: string) => Promise<void>;

export function iiiZipArchivePath(binDir: string): string {
  return join(binDir, `.iii-download-${process.pid}-${randomBytes(4).toString("hex")}.zip`);
}

function removeQuietly(path: string): void {
  try {
    rmSync(path, { force: true, recursive: true });
  } catch {}
}

export const STALE_INSTALL_FILE_MS = 15 * 60 * 1000;

export function removeStaleInstallFiles(binDir: string, now: number = Date.now()): string[] {
  const removed: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(binDir);
  } catch {
    return removed;
  }
  for (const name of entries) {
    if (!name.startsWith(".iii-download-") && !name.startsWith(".iii-staging-")) continue;
    const path = join(binDir, name);
    try {
      if (now - statSync(path).mtimeMs < STALE_INSTALL_FILE_MS) continue;
    } catch {
      continue;
    }
    removeQuietly(path);
    if (!existsSync(path)) removed.push(name);
  }
  return removed;
}

const PROXY_ENV_KEYS = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"];

export function proxyConfigured(env: NodeJS.ProcessEnv): boolean {
  return PROXY_ENV_KEYS.some((key) => Boolean(env[key]?.trim()));
}

export function windowsCurlDownloadCommand(
  url: string,
  dest: string,
  env: NodeJS.ProcessEnv = process.env,
): { command: string; args: string[] } {
  const systemRoot = env["SystemRoot"] || env["SYSTEMROOT"] || "C:\\Windows";
  return {
    command: join(systemRoot, "System32", "curl.exe"),
    args: [
      "-fsSL",
      "--connect-timeout",
      String(III_INSTALL_CONNECT_TIMEOUT_S),
      "--max-time",
      String(III_INSTALL_MAX_TIME_S),
      "--retry",
      String(III_INSTALL_RETRIES),
      "--retry-delay",
      String(III_INSTALL_RETRY_DELAY_S),
      "--retry-max-time",
      String(III_INSTALL_RETRY_MAX_TIME_S),
      "-o",
      dest,
      url,
    ],
  };
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

export async function downloadToFile(
  url: string,
  dest: string,
  env: NodeJS.ProcessEnv = process.env,
  run: ZipCommandRunner = runInstallCommand,
  request: typeof fetch = fetch,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms)),
): Promise<void> {
  if (proxyConfigured(env)) {
    const step = windowsCurlDownloadCommand(url, dest, env);
    const result = await run(step.command, step.args);
    if (result.status !== 0) throw new Error(describeInstallFailure(result));
    return;
  }
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    const retryable = attempt < III_INSTALL_RETRIES && Date.now() - started < III_INSTALL_RETRY_MAX_TIME_S * 1000;
    let res: Response;
    try {
      res = await request(url, { redirect: "follow", signal: AbortSignal.timeout(III_INSTALL_MAX_TIME_S * 1000) });
    } catch (error) {
      if (!retryable) throw error;
      await sleep(III_INSTALL_RETRY_DELAY_S * 1000);
      continue;
    }
    if (res.ok) {
      writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      return;
    }
    if (!retryable || !RETRYABLE_HTTP_STATUS.has(res.status)) {
      throw new Error(`download failed with HTTP ${res.status} ${res.statusText}`.trim());
    }
    await sleep(III_INSTALL_RETRY_DELAY_S * 1000);
  }
}

export function runInstallCommand(command: string, args: string[]): Promise<ZipRunResult> {
  return new Promise((done) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true, shell: false });
    const killOnExit = () => {
      try {
        child.kill();
      } catch {}
    };
    process.once("exit", killOnExit);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, III_INSTALL_SPAWN_TIMEOUT_MS);
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    let spawnError: (Error & { code?: string }) | undefined;
    child.on("error", (error: Error & { code?: string }) => {
      spawnError = error;
      if (child.pid !== undefined) return;
      clearTimeout(timer);
      process.off("exit", killOnExit);
      done({ status: null, stdout, stderr, error });
    });
    child.on("close", (status, signal) => {
      clearTimeout(timer);
      process.off("exit", killOnExit);
      if (spawnError && status === null && !timedOut) {
        done({ status: null, stdout, stderr, signal, error: spawnError });
        return;
      }
      if (timedOut) {
        done({ status: null, stdout, stderr, signal, error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }) });
        return;
      }
      done({ status, stdout, stderr, signal });
    });
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
  const run = opts.run ?? runInstallCommand;
  const download = opts.download ?? ((url: string, dest: string) => downloadToFile(url, dest, opts.env ?? process.env, run));
  const archive = iiiZipArchivePath(opts.binDir);

  try {
    mkdirSync(opts.binDir, { recursive: true });
    removeStaleInstallFiles(opts.binDir);
    await download(opts.releaseUrl, archive);
  } catch (err) {
    removeQuietly(archive);
    return { ok: false, reason: "download", detail: err instanceof Error ? err.message : String(err) };
  }

  let actual: string;
  try {
    actual = sha256File(archive);
  } catch (err) {
    removeQuietly(archive);
    return { ok: false, reason: "download", detail: err instanceof Error ? err.message : String(err) };
  }
  if (actual !== expected) {
    removeQuietly(archive);
    return {
      ok: false,
      reason: "checksum",
      detail: `SHA-256 mismatch for ${opts.asset}: expected ${expected}, got ${actual}. The download was deleted and nothing was installed`,
    };
  }

  const staging = join(opts.binDir, `.iii-staging-${process.pid}-${randomBytes(4).toString("hex")}`);
  const staged = join(staging, basename(opts.binPath));
  const failures: string[] = [];
  try {
    for (const step of windowsZipExtractCommands(archive, staging, opts.env)) {
      removeQuietly(staging);
      mkdirSync(staging, { recursive: true });
      const result = await run(step.command, step.args);
      if (result.status === 0 && existsSync(staged)) {
        try {
          renameSync(staged, opts.binPath);
          return { ok: true };
        } catch (err) {
          failures.push(`could not move ${staged} to ${opts.binPath}: ${err instanceof Error ? err.message : String(err)}`);
          break;
        }
      }
      failures.push(`${step.command}: ${result.status === 0 ? `finished but ${basename(opts.binPath)} is missing from the archive` : describeInstallFailure(result)}`);
    }
    return { ok: false, reason: "extract", detail: failures.join("; ") };
  } catch (err) {
    failures.push(err instanceof Error ? err.message : String(err));
    return { ok: false, reason: "extract", detail: failures.join("; ") };
  } finally {
    removeQuietly(staging);
    removeQuietly(archive);
  }
}
