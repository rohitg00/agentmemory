import { access, copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();

async function copyIfPresent(from, to) {
  try {
    await access(from);
  } catch {
    return;
  }
  await copyFile(from, to);
}

await mkdir(join(root, "dist"), { recursive: true });
await Promise.all([
  copyIfPresent(join(root, "iii-config.yaml"), join(root, "dist", "iii-config.yaml")),
  copyIfPresent(
    join(root, "iii-config.docker.yaml"),
    join(root, "dist", "iii-config.docker.yaml"),
  ),
  copyIfPresent(join(root, "docker-compose.yml"), join(root, "dist", "docker-compose.yml")),
]);

await mkdir(join(root, "dist", "viewer"), { recursive: true });
await copyFile(
  join(root, "src", "viewer", "index.html"),
  join(root, "dist", "viewer", "index.html"),
);
