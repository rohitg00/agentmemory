import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const SKILLS = join(ROOT, "plugin", "skills");

const errors: string[] = [];
const MAX_LINES = 100;
const DUP_MARKER = "/plugin list";

function parseFrontmatter(text: string): Record<string, string> | null {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  const body = text.slice(3, end);
  const out: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const m = /^([a-zA-Z_-]+):\s*(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const dirs = readdirSync(SKILLS, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
  .map((e) => e.name);

for (const name of dirs) {
  const skillFile = join(SKILLS, name, "SKILL.md");
  if (!existsSync(skillFile)) {
    errors.push(`${name}: missing SKILL.md`);
    continue;
  }
  const text = readFileSync(skillFile, "utf8");
  const rel = `plugin/skills/${name}/SKILL.md`;

  const fm = parseFrontmatter(text);
  if (!fm) {
    errors.push(`${rel}: missing or malformed frontmatter`);
  } else {
    if (!fm.name) errors.push(`${rel}: frontmatter missing 'name'`);
    if (fm.name && fm.name !== name) errors.push(`${rel}: frontmatter name '${fm.name}' != dir '${name}'`);
    if (!fm.description) errors.push(`${rel}: frontmatter missing 'description'`);
    else {
      if (!/use when/i.test(fm.description)) errors.push(`${rel}: description must contain a "Use when ..." trigger sentence`);
      if (fm.description.length > 1024) errors.push(`${rel}: description exceeds 1024 chars`);
    }
  }

  const lines = text.split("\n").length;
  if (lines > MAX_LINES) errors.push(`${rel}: ${lines} lines (max ${MAX_LINES}); move detail into REFERENCE.md or EXAMPLES.md`);

  const body = fm ? text.slice(text.indexOf("\n---", 3) + 4) : text;
  if (body.includes(DUP_MARKER)) {
    errors.push(`${rel}: inlines the shared troubleshooting block; reference ../_shared/TROUBLESHOOTING.md instead`);
  }
}

if (!existsSync(join(SKILLS, "_shared", "TROUBLESHOOTING.md"))) {
  errors.push(`_shared/TROUBLESHOOTING.md is missing`);
}

const pluginJson = join(ROOT, "plugin", "plugin.json");
if (existsSync(pluginJson)) {
  const desc = (JSON.parse(readFileSync(pluginJson, "utf8")).description as string) ?? "";
  const m = /(\d+)\s+skills/.exec(desc);
  if (!m) errors.push(`plugin/plugin.json: description should state the skill count as "N skills"`);
  else if (Number(m[1]) !== dirs.length) {
    errors.push(`plugin/plugin.json: description says ${m[1]} skills but ${dirs.length} skill dirs exist`);
  }
}

if (errors.length) {
  console.error("Skill lint failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`Skill lint passed: ${dirs.length} skills checked.`);
