import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const [root = "node_modules/onnxruntime-node/bin", platform = process.platform, arch = process.arch] = process.argv.slice(2);
const abis = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^napi-v\d+$/.test(entry.name))
  .map((entry) => join(root, entry.name));

if (abis.length === 0) throw new Error(`Unrecognized ONNX binary layout: ${root}`);

// Validate before deleting anything: a changed upstream layout must fail the build.
for (const abi of abis) {
  const binding = join(abi, platform, arch, "onnxruntime_binding.node");
  if (!statSync(binding, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Missing ONNX binding for ${platform}/${arch}: ${binding}`);
  }
}

for (const abi of abis) {
  for (const os of readdirSync(abi, { withFileTypes: true })) {
    if (!os.isDirectory()) continue;
    const osPath = join(abi, os.name);
    if (os.name !== platform) {
      rmSync(osPath, { recursive: true });
      continue;
    }
    for (const cpu of readdirSync(osPath, { withFileTypes: true })) {
      if (cpu.isDirectory() && cpu.name !== arch) {
        rmSync(join(osPath, cpu.name), { recursive: true });
      }
    }
  }
}
console.log(`Kept ONNX native binaries for ${platform}/${arch}`);
