import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(repoRoot, "dist");

mkdirSync(distDir, { recursive: true });

for (const relativePath of [
  "iii-config.yaml",
  "iii-config.docker.yaml",
  "docker-compose.yml",
  ".env.example",
]) {
  const source = resolve(repoRoot, relativePath);
  if (existsSync(source)) {
    copyFileSync(source, resolve(distDir, relativePath));
  }
}

const viewerDir = resolve(distDir, "viewer");
mkdirSync(viewerDir, { recursive: true });

for (const fileName of ["index.html", "favicon.svg"]) {
  copyFileSync(
    resolve(repoRoot, "src", "viewer", fileName),
    resolve(viewerDir, fileName),
  );
}
