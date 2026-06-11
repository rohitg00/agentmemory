import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");

async function copyToDist(source, target = source) {
  await copyFile(join(root, source), join(dist, target));
}

await mkdir(dist, { recursive: true });
await mkdir(join(dist, "viewer"), { recursive: true });

await Promise.all([
  copyToDist("iii-config.yaml"),
  copyToDist("iii-config.docker.yaml"),
  copyToDist("docker-compose.yml"),
  copyToDist(".env.example"),
  copyToDist(join("src", "viewer", "index.html"), join("viewer", "index.html")),
  copyToDist(join("src", "viewer", "favicon.svg"), join("viewer", "favicon.svg")),
]);
