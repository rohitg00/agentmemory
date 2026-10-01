import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  III_INSTALL_CONNECT_TIMEOUT_S,
  III_INSTALL_MAX_TIME_S,
  describeInstallFailure,
  iiiInstallShellCommand,
  iiiManualInstallCommand,
} from "../src/cli/engine-install.js";

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

function runInstall(dir: string, bin: string) {
  const binDir = join(dir, "bin");
  const binPath = join(binDir, "iii");
  const result = spawnSync(
    "sh",
    ["-c", iiiInstallShellCommand("https://example.invalid/iii.tar.gz", binDir, binPath)],
    { encoding: "utf-8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } },
  );
  return { result, binDir, binPath };
}

describe("iii engine auto-installer", () => {
  it("passes connect and overall timeouts to curl", () => {
    const cmd = iiiInstallShellCommand("https://x/iii.tar.gz", "/b", "/b/iii");
    expect(cmd).toContain(`--connect-timeout ${III_INSTALL_CONNECT_TIMEOUT_S}`);
    expect(cmd).toContain(`--max-time ${III_INSTALL_MAX_TIME_S}`);
  });

  it("leaves no partial binary or archive behind when the download times out", () => {
    const dir = sandbox();
    const bin = fakeCurl(
      dir,
      'out=""; while [ $# -gt 0 ]; do if [ "$1" = "-o" ]; then out="$2"; fi; shift; done; printf partial > "$out"; echo "curl: (28) Operation timed out" >&2; exit 28',
    );
    const { result, binDir, binPath } = runInstall(dir, bin);

    expect(result.status).toBe(28);
    expect(existsSync(binPath)).toBe(false);
    expect(readdirSync(binDir)).toEqual([]);
    expect(describeInstallFailure(result)).toContain("timed out");
  });

  it("installs the binary when the download completes", () => {
    const dir = sandbox();
    const staging = join(dir, "staging");
    mkdirSync(staging);
    writeFileSync(join(staging, "iii"), "#!/bin/sh\necho iii\n");
    const tarball = join(dir, "iii.tar.gz");
    spawnSync("tar", ["-czf", tarball, "-C", staging, "iii"]);
    const bin = fakeCurl(
      dir,
      `out=""; while [ $# -gt 0 ]; do if [ "$1" = "-o" ]; then out="$2"; fi; shift; done; cp "${tarball}" "$out"`,
    );
    const { result, binDir, binPath } = runInstall(dir, bin);

    expect(result.status).toBe(0);
    expect(existsSync(binPath)).toBe(true);
    expect(readdirSync(binDir)).toEqual(["iii"]);
  });

  it("explains a timeout without stderr and prints a copyable manual command", () => {
    expect(describeInstallFailure({ status: 28, stderr: "" })).toContain("download timed out");
    expect(
      describeInstallFailure({ status: null, error: Object.assign(new Error("x"), { code: "ETIMEDOUT" }) }),
    ).toContain("timed out after");
    const manual = iiiManualInstallCommand("https://x/iii.tar.gz", "/b", "/b/iii");
    expect(manual).toContain('curl -fL --connect-timeout');
    expect(manual).toContain('chmod +x "/b/iii"');
    expect(manual).toContain('mktemp "/b/.iii-download.XXXXXX"');
    expect(manual).not.toContain("/tmp/");
    expect(manual).toContain('rm -f "$archive"; (exit $code)');
  });
});
