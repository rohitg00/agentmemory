import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = join(root, "plugin/skills");
const skills = readdirSync(source, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(source, entry.name, "SKILL.md")));
if (skills.length === 0) throw new Error("No native plugin skills found");
for (const integration of ["openclaw", "omp", "pi"]) {
  const destination = join(root, "integrations", integration, "skills");
  rmSync(destination, { recursive: true, force: true });
  for (const skill of skills) cpSync(join(source, skill.name), join(destination, skill.name), { recursive: true });
  cpSync(join(root, "LICENSE"), join(root, "integrations", integration, "LICENSE"));
  console.error(`Prepared ${integration} plugin with ${skills.length} self-contained skills`);
}
