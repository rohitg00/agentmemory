import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const copyIfExists = (from, to) => {
  if (!existsSync(from)) return;
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
};

mkdirSync(dist, { recursive: true });

for (const name of [
  'iii-config.yaml',
  'iii-config.docker.yaml',
  'docker-compose.yml',
  '.env.example',
]) {
  copyIfExists(join(root, name), join(dist, name));
}

const viewerDist = join(dist, 'viewer');
mkdirSync(viewerDist, { recursive: true });
copyIfExists(join(root, 'src', 'viewer', 'index.html'), join(viewerDist, 'index.html'));
copyIfExists(join(root, 'src', 'viewer', 'favicon.svg'), join(viewerDist, 'favicon.svg'));
