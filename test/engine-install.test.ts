import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  III_INSTALL_CONNECT_TIMEOUT_S,
  III_INSTALL_MAX_TIME_S,
  III_INSTALL_RETRIES,
  III_INSTALL_RETRY_DELAY_S,
  III_RELEASE_SHA256,
  describeInstallFailure,
  expectedIiiSha256,
  iiiDownloadShellCommand,
  iiiManualInstallCommand,
  installIiiArchive,
  sha256File,
  downloadToFile,
  iiiZipArchivePath,
  installIiiZip,
  powershellLiteral,
  proxyConfigured,
  removeStaleInstallFiles,
  runInstallCommand,
  STALE_INSTALL_FILE_MS,
  windowsZipExtractCommands,
} from "../src/cli/engine-install.js";
import { III_PINNED_VERSION } from "../src/version.js";

const ASSET = "iii-x86_64-unknown-linux-gnu.tar.gz";
const sandboxes: string[] = [];

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), "agentmemory-install-"));
  sandboxes.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of sandboxes.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fakeCurl(dir: string, script: string): string {
  const bin = join(dir, "fakebin");
  mkdirSync(bin, { recursive: true });
  const path = join(bin, "curl");
  writeFileSync(path, `#!/bin/sh\n${script}\n`);
  chmodSync(path, 0o755);
  return bin;
}

function buildTarball(dir: string): string {
  const staging = join(dir, "staging");
  mkdirSync(staging);
  writeFileSync(join(staging, "iii"), "#!/bin/sh\necho iii\n");
  const tarball = join(dir, "iii.tar.gz");
  spawnSync("tar", ["-czf", tarball, "-C", staging, "iii"]);
  return tarball;
}

function curlServing(dir: string, tarball: string): string {
  return fakeCurl(
    dir,
    `out=""; while [ $# -gt 0 ]; do if [ "$1" = "-o" ]; then out="$2"; fi; shift; done; cp "${tarball}" "$out"`,
  );
}

function runInstall(dir: string, bin: string, sha256: string | null, asset = ASSET) {
  const binDir = join(dir, "bin");
  const binPath = join(binDir, "iii");
  const checksums = sha256 ? { "9.9.9": { [ASSET]: sha256 } } : {};
  const outcome = installIiiArchive({
    sh: "sh",
    releaseUrl: "https://example.invalid/iii.tar.gz",
    version: "9.9.9",
    asset,
    binDir,
    binPath,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    checksums,
  });
  return { outcome, binDir, binPath };
}

describe("iii engine auto-installer", () => {
  it("keeps the SDK, helper and deployment defaults aligned with the installed engine", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8"));
    expect(manifest.dependencies["iii-sdk"]).toBe(III_PINNED_VERSION);
    expect(manifest.dependencies["@iii-dev/helpers"]).toBe(III_PINNED_VERSION);
    expect(readFileSync("deploy/Dockerfile", "utf8")).toContain(`ARG III_VERSION=${III_PINNED_VERSION}\n`);
    expect(readFileSync("docker-compose.yml", "utf8")).toContain(`III_VERSION: "\${III_VERSION:-${III_PINNED_VERSION}}"`);
  });

  it("passes connect and overall timeouts to curl", () => {
    const cmd = iiiDownloadShellCommand();
    expect(cmd).toContain(`--connect-timeout ${III_INSTALL_CONNECT_TIMEOUT_S}`);
    expect(cmd).toContain(`--max-time ${III_INSTALL_MAX_TIME_S}`);
  });

  it("pins a SHA-256 for every auto-installable asset of the pinned engine release", () => {
    const pinned = III_RELEASE_SHA256[III_PINNED_VERSION];
    expect(pinned).toBeDefined();
    for (const asset of [
      "iii-aarch64-apple-darwin.tar.gz",
      "iii-x86_64-apple-darwin.tar.gz",
      "iii-x86_64-unknown-linux-gnu.tar.gz",
      "iii-aarch64-unknown-linux-gnu.tar.gz",
      "iii-armv7-unknown-linux-gnueabihf.tar.gz",
      "iii-x86_64-pc-windows-msvc.zip",
      "iii-aarch64-pc-windows-msvc.zip",
    ]) {
      expect(expectedIiiSha256(III_PINNED_VERSION, asset)).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("keeps the previous engine release auto-installable for a version override", () => {
    expect(expectedIiiSha256("0.25.0", "iii-x86_64-unknown-linux-gnu.tar.gz")).toMatch(/^[0-9a-f]{64}$/);
    expect(expectedIiiSha256("0.25.0", "iii-x86_64-pc-windows-msvc.zip")).toMatch(/^[0-9a-f]{64}$/);
    expect(expectedIiiSha256("0.25.0", "iii-x86_64-unknown-linux-gnu.tar.gz")).not.toBe(
      expectedIiiSha256(III_PINNED_VERSION, "iii-x86_64-unknown-linux-gnu.tar.gz"),
    );
  });

  it("leaves no partial binary or archive behind when the download times out", () => {
    const dir = sandbox();
    const bin = fakeCurl(
      dir,
      'out=""; while [ $# -gt 0 ]; do if [ "$1" = "-o" ]; then out="$2"; fi; shift; done; printf partial > "$out"; echo "curl: (28) Operation timed out" >&2; exit 28',
    );
    const { outcome, binDir, binPath } = runInstall(dir, bin, "0".repeat(64));

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("download");
      expect(outcome.detail).toContain("timed out");
    }
    expect(existsSync(binPath)).toBe(false);
    expect(readdirSync(binDir)).toEqual([]);
  });

  it("installs the binary when the download matches the pinned SHA-256", () => {
    const dir = sandbox();
    const tarball = buildTarball(dir);
    const { outcome, binDir, binPath } = runInstall(dir, curlServing(dir, tarball), sha256File(tarball));

    expect(outcome).toEqual({ ok: true });
    expect(existsSync(binPath)).toBe(true);
    expect(readdirSync(binDir)).toEqual(["iii"]);
  });

  it("refuses to extract a download whose SHA-256 does not match", () => {
    const dir = sandbox();
    const tarball = buildTarball(dir);
    const wrong = "f".repeat(64);
    const { outcome, binDir, binPath } = runInstall(dir, curlServing(dir, tarball), wrong);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe("checksum");
      expect(outcome.detail).toContain(`expected ${wrong}`);
      expect(outcome.detail).toContain(`got ${sha256File(tarball)}`);
    }
    expect(existsSync(binPath)).toBe(false);
    expect(readdirSync(binDir)).toEqual([]);
  });

  it("passes paths to the shell as arguments, never as script text", () => {
    const dir = sandbox();
    const tarball = buildTarball(dir);
    const tricky = join(dir, 'odd $(touch pwned) "dir"');
    const binPath = join(tricky, "iii");
    const outcome = installIiiArchive({
      sh: "sh",
      releaseUrl: "https://example.invalid/iii.tar.gz",
      version: "9.9.9",
      asset: ASSET,
      binDir: tricky,
      binPath,
      env: { ...process.env, PATH: `${curlServing(dir, tarball)}:${process.env.PATH}` },
      checksums: { "9.9.9": { [ASSET]: sha256File(tarball) } },
    });

    expect(outcome).toEqual({ ok: true });
    expect(existsSync(binPath)).toBe(true);
    expect(existsSync(join(process.cwd(), "pwned"))).toBe(false);
    expect(iiiDownloadShellCommand()).not.toContain(dir);
  });

  it("does not download anything for a platform or version without a pinned SHA-256", () => {
    const dir = sandbox();
    const bin = fakeCurl(dir, `touch "${join(dir, "curl-called")}"; exit 1`);
    const { outcome, binDir } = runInstall(dir, bin, null, "iii-riscv64-unknown-linux-gnu.tar.gz");

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("no-checksum");
    expect(existsSync(join(dir, "curl-called"))).toBe(false);
    expect(existsSync(binDir)).toBe(false);
    expect(expectedIiiSha256(III_PINNED_VERSION, "iii-riscv64-unknown-linux-gnu.tar.gz")).toBeNull();
  });

  it("explains a timeout without stderr and prints a copyable manual command that verifies the archive", () => {
    expect(describeInstallFailure({ status: 28, stderr: "" })).toContain("download timed out");
    expect(
      describeInstallFailure({ status: null, error: Object.assign(new Error("x"), { code: "ETIMEDOUT" }) }),
    ).toContain("timed out after");
    const sha = "a".repeat(64);
    const manual = iiiManualInstallCommand("https://x/iii.tar.gz", "/b", "/b/iii", sha);
    expect(manual).toContain("curl -fL --connect-timeout");
    expect(manual).toContain('chmod +x "/b/iii"');
    expect(manual).toContain('mktemp "/b/.iii-download.XXXXXX"');
    expect(manual).not.toContain("/tmp/");
    expect(manual).toContain('rm -f "$archive"; (exit $code)');
    expect(manual).toContain(sha);
    expect(manual.indexOf(sha)).toBeLessThan(manual.indexOf("tar -xzf"));
    expect(iiiManualInstallCommand("https://x/iii.tar.gz", "/b", "/b/iii", null)).not.toContain("sha256sum");
  });

  it("the manual command stops before extraction when the checksum does not match", () => {
    const dir = sandbox();
    const tarball = buildTarball(dir);
    const bin = curlServing(dir, tarball);
    const binDir = join(dir, "manual");
    const binPath = join(binDir, "iii");
    const run = (sha: string) =>
      spawnSync("sh", ["-c", iiiManualInstallCommand("https://example.invalid/iii.tar.gz", binDir, binPath, sha)], {
        encoding: "utf-8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      });

    expect(run("e".repeat(64)).status).not.toBe(0);
    expect(existsSync(binPath)).toBe(false);
    expect(run(sha256File(tarball)).status).toBe(0);
    expect(existsSync(binPath)).toBe(true);
  });
});

describe("iii engine Windows zip installer", () => {
  const ZIP_ASSET = "iii-x86_64-pc-windows-msvc.zip";
  const ZIP_BYTES = Buffer.from("fake windows iii zip");

  function leftoverArchives(binDir: string): string[] {
    return existsSync(binDir) ? readdirSync(binDir).filter((name) => name.startsWith(".iii-download") || name.startsWith(".iii-staging")) : [];
  }

  function extractDest(args: string[]): string {
    if (args[0] === "-xf") return args[3];
    const match = /-DestinationPath '((?:[^']|'')*)'/.exec(args[3] ?? "");
    return (match?.[1] ?? "").replace(/''/g, "'");
  }

  function zipChecksums(bytes: Buffer = ZIP_BYTES) {
    const dir = sandbox();
    const file = join(dir, "probe.zip");
    writeFileSync(file, bytes);
    return { "9.9.9": { [ZIP_ASSET]: sha256File(file) } };
  }

  function zipOpts(binDir: string, extra: Record<string, unknown> = {}) {
    return {
      releaseUrl: "https://example.invalid/iii.zip",
      version: "9.9.9",
      asset: ZIP_ASSET,
      binDir,
      binPath: join(binDir, "iii.exe"),
      env: { SystemRoot: "C:\\Windows" },
      checksums: zipChecksums(),
      download: async (_url: string, dest: string) => writeFileSync(dest, ZIP_BYTES),
      ...extra,
    };
  }

  it("extracts with System32 tar.exe first and PowerShell Expand-Archive second, without a shell", () => {
    const steps = windowsZipExtractCommands("C:\\a\\.iii-download.zip", "C:\\a", { SystemRoot: "C:\\Windows" });
    expect(steps).toHaveLength(2);
    expect(steps[0].command).toMatch(/System32[\\/]tar\.exe$/);
    expect(steps[0].args).toEqual(["-xf", "C:\\a\\.iii-download.zip", "-C", "C:\\a"]);
    expect(steps[1].command).toMatch(/WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/);
    expect(steps[1].args.slice(0, 3)).toEqual(["-NoProfile", "-NonInteractive", "-Command"]);
    expect(steps[1].args[3]).toContain("Expand-Archive -LiteralPath 'C:\\a\\.iii-download.zip'");
  });

  it("quotes PowerShell paths so a quote in the profile path cannot end the string", () => {
    expect(powershellLiteral("C:\\Users\\o'brien")).toBe("'C:\\Users\\o''brien'");
  });

  it("installs when the download matches the pinned SHA-256 and tar.exe extracts iii.exe", async () => {
    const binDir = join(sandbox(), "bin");
    const calls: string[] = [];
    const outcome = await installIiiZip(zipOpts(binDir, {
      run: (command: string, args: string[]) => {
        calls.push(command);
        writeFileSync(join(extractDest(args), "iii.exe"), "bin");
        return { status: 0 };
      },
    }));
    expect(outcome).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/tar\.exe$/);
    expect(leftoverArchives(binDir)).toEqual([]);
  });

  it("falls back to Expand-Archive when tar.exe fails", async () => {
    const binDir = join(sandbox(), "bin");
    const calls: string[] = [];
    const outcome = await installIiiZip(zipOpts(binDir, {
      run: (command: string, args: string[]) => {
        calls.push(command);
        if (command.endsWith("tar.exe")) return { status: 1, stderr: "tar: unsupported" };
        writeFileSync(join(extractDest(args), "iii.exe"), "bin");
        return { status: 0 };
      },
    }));
    expect(outcome).toEqual({ ok: true });
    expect(calls.map((c) => c.split(/[\\/]/).pop())).toEqual(["tar.exe", "powershell.exe"]);
  });

  it("never extracts a download whose SHA-256 does not match", async () => {
    const binDir = join(sandbox(), "bin");
    let ran = false;
    const outcome = await installIiiZip(zipOpts(binDir, {
      download: async (_url: string, dest: string) => writeFileSync(dest, Buffer.from("tampered")),
      run: () => {
        ran = true;
        return { status: 0 };
      },
    }));
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe("checksum");
    expect(ran).toBe(false);
    expect(leftoverArchives(binDir)).toEqual([]);
  });

  it("downloads nothing for an asset without a pinned SHA-256", async () => {
    const binDir = join(sandbox(), "bin");
    let downloaded = false;
    const outcome = await installIiiZip(zipOpts(binDir, {
      checksums: { "9.9.9": {} },
      download: async () => {
        downloaded = true;
      },
    }));
    expect(outcome.ok === false && outcome.reason).toBe("no-checksum");
    expect(downloaded).toBe(false);
  });

  it("reports an extract failure when neither extractor produces iii.exe", async () => {
    const binDir = join(sandbox(), "bin");
    const outcome = await installIiiZip(zipOpts(binDir, { run: () => ({ status: 0 }) }));
    expect(outcome.ok === false && outcome.reason).toBe("extract");
    expect(outcome.ok === false && outcome.detail).toContain("iii.exe is missing");
  });

  it("extracts into a staging directory and keeps a working iii.exe when extraction fails", async () => {
    const binDir = join(sandbox(), "bin");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(binDir, "iii.exe"), "working");
    const dests: string[] = [];
    const outcome = await installIiiZip(zipOpts(binDir, {
      run: (_command: string, args: string[]) => {
        dests.push(extractDest(args));
        writeFileSync(join(extractDest(args), "iii.exe"), "partial");
        return { status: 1, stderr: "disk full" };
      },
    }));
    expect(outcome.ok === false && outcome.reason).toBe("extract");
    expect(dests.every((dest) => dest !== binDir && dest.includes(".iii-staging-"))).toBe(true);
    expect(readFileSync(join(binDir, "iii.exe"), "utf-8")).toBe("working");
    expect(leftoverArchives(binDir)).toEqual([]);
  });

  it("replaces iii.exe only after the staged copy exists", async () => {
    const binDir = join(sandbox(), "bin");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(binDir, "iii.exe"), "old");
    const outcome = await installIiiZip(zipOpts(binDir, {
      run: (_command: string, args: string[]) => {
        writeFileSync(join(extractDest(args), "iii.exe"), "new");
        return { status: 0 };
      },
    }));
    expect(outcome).toEqual({ ok: true });
    expect(readFileSync(join(binDir, "iii.exe"), "utf-8")).toBe("new");
    expect(leftoverArchives(binDir)).toEqual([]);
  });

  it("runs install commands without blocking the event loop, so Ctrl+C handlers can still run", async () => {
    let timerFired = false;
    setTimeout(() => { timerFired = true; }, 20);
    const pending = runInstallCommand(process.execPath, ["-e", "setTimeout(() => process.stdout.write('done'), 300)"]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(timerFired).toBe(true);
    const result = await pending;
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("done");
  });

  it("returns an extract failure instead of throwing when an extractor throws", async () => {
    const binDir = join(sandbox(), "bin");
    const outcome = await installIiiZip(zipOpts(binDir, {
      run: () => {
        throw new Error("EPERM: staging denied");
      },
    }));
    expect(outcome.ok === false && outcome.reason).toBe("extract");
    expect(outcome.ok === false && outcome.detail).toContain("EPERM: staging denied");
    expect(leftoverArchives(binDir)).toEqual([]);
  });

  it("reports a missing executable without waiting for a close event", async () => {
    const result = await runInstallCommand(join(sandbox(), "no-such-tool.exe"), []);
    expect(result.status).toBeNull();
    expect(result.error?.code).toBe("ENOENT");
  });

  it("kills a running install command when the CLI exits", async () => {
    const before = process.listenerCount("exit");
    const pending = runInstallCommand(process.execPath, ["-e", "setTimeout(() => {}, 5000)"]);
    expect(process.listenerCount("exit")).toBe(before + 1);
    process.listeners("exit").at(-1)?.call(process, 0);
    const result = await pending;
    expect(result.status === 0).toBe(false);
    expect(process.listenerCount("exit")).toBe(before);
  });

  it("removes stale archives and staging folders from earlier failed installs", () => {
    const binDir = join(sandbox(), "bin");
    mkdirSync(join(binDir, ".iii-staging-1-old"), { recursive: true });
    writeFileSync(join(binDir, ".iii-download-1-old.zip"), "x");
    writeFileSync(join(binDir, ".iii-download-2-fresh.zip"), "x");
    writeFileSync(join(binDir, "iii.exe"), "keep");
    const later = Date.now() + STALE_INSTALL_FILE_MS + 1000;
    const freshNow = Date.now();
    const removedLater = removeStaleInstallFiles(binDir, later);
    expect(removedLater.sort()).toEqual([".iii-download-1-old.zip", ".iii-download-2-fresh.zip", ".iii-staging-1-old"]);
    expect(existsSync(join(binDir, "iii.exe"))).toBe(true);
    writeFileSync(join(binDir, ".iii-download-3-new.zip"), "x");
    expect(removeStaleInstallFiles(binDir, freshNow)).toEqual([]);
    expect(existsSync(join(binDir, ".iii-download-3-new.zip"))).toBe(true);
  });

  it("gives every install its own archive file so concurrent starts cannot clobber each other", () => {
    const a = iiiZipArchivePath("C:\\bin");
    const b = iiiZipArchivePath("C:\\bin");
    expect(a).not.toBe(b);
    expect(a).toContain(`.iii-download-${process.pid}-`);
    expect(a.endsWith(".zip")).toBe(true);
  });

  it("downloads through System32 curl.exe when a proxy is configured", async () => {
    expect(proxyConfigured({})).toBe(false);
    expect(proxyConfigured({ HTTPS_PROXY: "http://proxy:3128" })).toBe(true);
    expect(proxyConfigured({ http_proxy: " " })).toBe(false);
    const calls: { command: string; args: string[] }[] = [];
    await downloadToFile("https://example.invalid/iii.zip", "C:\\bin\\a.zip", { SystemRoot: "C:\\Windows", HTTPS_PROXY: "http://proxy:3128" }, (command, args) => {
      calls.push({ command, args });
      return { status: 0 };
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toMatch(/System32[\\/]curl\.exe$/);
    expect(calls[0].args).toEqual(expect.arrayContaining(["-o", "C:\\bin\\a.zip", "https://example.invalid/iii.zip", "--max-time"]));
    await expect(downloadToFile("https://example.invalid/iii.zip", "C:\\bin\\a.zip", { HTTPS_PROXY: "http://proxy:3128" }, () => ({ status: 22, stderr: "curl: (22) 407" }))).rejects.toThrow("407");
  });

  it("retries transient download failures before giving up", async () => {
    expect(iiiDownloadShellCommand()).toContain(`--retry ${III_INSTALL_RETRIES} --retry-delay ${III_INSTALL_RETRY_DELAY_S}`);
    expect(iiiManualInstallCommand("https://x/iii.tar.gz", "/b", "/b/iii", null)).toContain(`--retry ${III_INSTALL_RETRIES}`);
    const curlCalls: string[][] = [];
    await downloadToFile("https://example.invalid/iii.zip", "C:\\bin\\a.zip", { HTTPS_PROXY: "http://proxy:3128" }, (_command, args) => {
      curlCalls.push(args);
      return { status: 0 };
    });
    expect(curlCalls[0]).toEqual(expect.arrayContaining(["--retry", String(III_INSTALL_RETRIES), "--retry-delay", String(III_INSTALL_RETRY_DELAY_S)]));

    const dir = mkdtempSync(join(tmpdir(), "am-retry-"));
    const dest = join(dir, "iii.zip");
    const statuses = [504, 503, 200];
    const sleeps: number[] = [];
    const request = (async () => {
      const status = statuses.shift()!;
      return new Response(status === 200 ? "zip-bytes" : "busy", { status });
    }) as typeof fetch;
    await downloadToFile("https://example.invalid/iii.zip", dest, {}, undefined, request, async (ms) => { sleeps.push(ms); });
    expect(readFileSync(dest, "utf8")).toBe("zip-bytes");
    expect(sleeps).toEqual([III_INSTALL_RETRY_DELAY_S * 1000, III_INSTALL_RETRY_DELAY_S * 1000]);

    let attempts = 0;
    const alwaysBusy = (async () => { attempts++; return new Response("busy", { status: 504 }); }) as typeof fetch;
    await expect(downloadToFile("https://example.invalid/iii.zip", dest, {}, undefined, alwaysBusy, async () => {})).rejects.toThrow("HTTP 504");
    expect(attempts).toBe(III_INSTALL_RETRIES + 1);

    attempts = 0;
    const missing = (async () => { attempts++; return new Response("missing", { status: 404 }); }) as typeof fetch;
    await expect(downloadToFile("https://example.invalid/iii.zip", dest, {}, undefined, missing, async () => {})).rejects.toThrow("HTTP 404");
    expect(attempts).toBe(1);
  });

  it("pins a SHA-256 for both Windows assets of the pinned release", () => {
    expect(expectedIiiSha256(III_PINNED_VERSION, "iii-x86_64-pc-windows-msvc.zip")).toMatch(/^[0-9a-f]{64}$/);
    expect(expectedIiiSha256(III_PINNED_VERSION, "iii-aarch64-pc-windows-msvc.zip")).toMatch(/^[0-9a-f]{64}$/);
  });
});
