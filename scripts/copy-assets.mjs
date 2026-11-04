import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
const dist = join(root, 'dist');

mkdirSync(dist, { recursive: true });

for (const name of ['iii-config.yaml', 'iii-config.docker.yaml', 'docker-compose.yml']) {
  rmSync(join(dist, name), { force: true });
}

const envExample = join(root, '.env.example');
if (existsSync(envExample)) copyFileSync(envExample, join(dist, '.env.example'));

const viewerDist = join(dist, 'viewer');
mkdirSync(viewerDist, { recursive: true });
for (const name of ['index.html', 'favicon.svg']) {
  copyFileSync(join(root, 'src', 'viewer', name), join(viewerDist, name));
}
