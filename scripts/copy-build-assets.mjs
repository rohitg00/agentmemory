import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");

async function copyIfPresent(from, to) {
  try {
    await cp(join(root, from), join(root, to));
  } catch (err) {
    if (err && err.code === "ENOENT") return;
    throw err;
  }
}

await mkdir(join(dist, "viewer"), { recursive: true });

await Promise.all([
  copyIfPresent("iii-config.yaml", "dist/iii-config.yaml"),
  copyIfPresent("iii-config.docker.yaml", "dist/iii-config.docker.yaml"),
  copyIfPresent("docker-compose.yml", "dist/docker-compose.yml"),
  copyIfPresent(".env.example", "dist/.env.example"),
  copyIfPresent("src/viewer/index.html", "dist/viewer/index.html"),
  copyIfPresent("src/viewer/favicon.svg", "dist/viewer/favicon.svg"),
]);
