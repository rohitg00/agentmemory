import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve("scripts/deploy/prune-onnx.mjs");
const roots: string[] = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "deploy-onnx-"));
  roots.push(root);
  const bin = join(root, "onnxruntime-node", "bin");
  for (const platform of ["linux", "darwin", "win32"]) {
    for (const arch of ["arm64", "x64"]) {
      const target = join(bin, "napi-v6", platform, arch);
      mkdirSync(target, { recursive: true });
      writeFileSync(join(target, "onnxruntime_binding.node"), `${platform}/${arch}`, { mode: 0o755 });
      writeFileSync(join(target, "runtime-library"), "runtime");
    }
  }
  writeFileSync(join(bin, "NOTICE"), "keep metadata");
  writeFileSync(join(root, "unrelated-package"), "keep other packages");
  return { root, bin };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("deployment ONNX binary pruning", () => {
  it.each(["arm64", "x64"])("keeps the complete Linux %s runtime and removes foreign binaries", (arch) => {
    const { root, bin } = fixture();
    execFileSync(process.execPath, [script, bin, "linux", arch]);

    const abi = join(bin, "napi-v6");
    expect(readdirSync(abi)).toEqual(["linux"]);
    expect(readdirSync(join(abi, "linux"))).toEqual([arch]);
    const binding = join(abi, "linux", arch, "onnxruntime_binding.node");
    expect(readFileSync(binding, "utf8")).toBe(`linux/${arch}`);
    if (process.platform !== "win32") expect(statSync(binding).mode & 0o777).toBe(0o755);
    expect(readFileSync(join(abi, "linux", arch, "runtime-library"), "utf8")).toBe("runtime");
    expect(readFileSync(join(bin, "NOTICE"), "utf8")).toBe("keep metadata");
    expect(readFileSync(join(root, "unrelated-package"), "utf8")).toBe("keep other packages");
  });

  it("fails before deleting anything when the target binding is missing", () => {
    const { bin } = fixture();
    rmSync(join(bin, "napi-v6", "linux", "arm64", "onnxruntime_binding.node"));
    expect(() => execFileSync(process.execPath, [script, bin, "linux", "arm64"], { stdio: "pipe" })).toThrow(/Missing ONNX binding/);
    expect(readdirSync(join(bin, "napi-v6")).sort()).toEqual(["darwin", "linux", "win32"]);
    expect(existsSync(join(bin, "napi-v6", "linux", "x64", "onnxruntime_binding.node"))).toBe(true);
  });

  it("validates every ABI before pruning any binaries", () => {
    const { bin } = fixture();
    cpSync(join(bin, "napi-v6"), join(bin, "napi-v7"), { recursive: true });
    const abis = readdirSync(bin, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(abis).toHaveLength(2);
    rmSync(join(bin, abis[1], "linux", "arm64", "onnxruntime_binding.node"));
    const before = readdirSync(bin, { recursive: true }).sort();

    expect(() => execFileSync(process.execPath, [script, bin, "linux", "arm64"], { stdio: "pipe" })).toThrow(/Missing ONNX binding/);
    expect(readdirSync(bin, { recursive: true }).sort()).toEqual(before);
  });

  it("rejects an unrecognized binary layout without deleting it", () => {
    const { bin } = fixture();
    rmSync(join(bin, "napi-v6"), { recursive: true });
    mkdirSync(join(bin, "new-layout"));
    writeFileSync(join(bin, "new-layout", "runtime"), "keep unknown layout");
    expect(() => execFileSync(process.execPath, [script, bin, "linux", "arm64"], { stdio: "pipe" })).toThrow(/Unrecognized ONNX binary layout/);
    expect(readFileSync(join(bin, "new-layout", "runtime"), "utf8")).toBe("keep unknown layout");
  });
});
