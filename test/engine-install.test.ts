import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  III_INSTALL_CONNECT_TIMEOUT_S,
  III_INSTALL_MAX_TIME_S,
  III_RELEASE_SHA256,
  describeInstallFailure,
  expectedIiiSha256,
  iiiDownloadShellCommand,
  iiiManualInstallCommand,
  installIiiArchive,
  sha256File,
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
