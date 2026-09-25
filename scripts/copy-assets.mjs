import { copyFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = process.cwd();
const dist = resolve(root, "dist");

const optionalFiles = [
  "iii-config.yaml",
  "iii-config.docker.yaml",
  "docker-compose.yml",
  ".env.example",
];

await mkdir(join(dist, "viewer"), { recursive: true });

for (const file of optionalFiles) {
  try {
    await copyFile(join(root, file), join(dist, file));
  } catch (err) {
    // These files are optional; ignore if they don't exist.
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
}

await copyFile(join(root, "src/viewer/index.html"), join(dist, "viewer", "index.html"));
await copyFile(join(root, "src/viewer/favicon.svg"), join(dist, "viewer", "favicon.svg"));
