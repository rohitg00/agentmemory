import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = join(root, "plugin/skills");
const destination = join(root, "integrations/openclaw/skills");
const skills = readdirSync(source, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(source, entry.name, "SKILL.md")));
if (skills.length === 0) throw new Error("No native plugin skills found");
rmSync(destination, { recursive: true, force: true });
for (const skill of skills) cpSync(join(source, skill.name), join(destination, skill.name), { recursive: true });
cpSync(join(root, "LICENSE"), join(root, "integrations/openclaw/LICENSE"));
console.error(`Prepared OpenClaw plugin with ${skills.length} self-contained skills`);
