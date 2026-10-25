import { createHash, randomUUID } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { findPluginRoot } from "./codex-hooks.js";
import { backupFile, ensureBackupsDir } from "./util.js";

const MANIFEST = ".agentmemory-install.json";
const digest = (content: Buffer) => createHash("sha256").update(content).digest("hex");
export const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function nativePackageRoot(): string {
  return dirname(findPluginRoot());
}

export function nativeUserPath(value: string, home: string): string {
  return resolve(value.replace(/^~(?=$|[/\\])/, () => home));
}

export function nativeMcpEntry(packageRoot: string): Record<string, unknown> {
  const entry = join(packageRoot, "dist", "standalone.mjs");
  if (!existsSync(entry)) throw new Error("Bundled MCP runtime is missing; reinstall AgentMemory before connecting.");
  return { command: process.execPath, args: [entry], env: { AGENTMEMORY_TOOLS: "all", AGENTMEMORY_FORCE_PROXY: "1" } };
}

function filesUnder(dir: string, prefix = ""): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (["__pycache__", ".git", "node_modules", MANIFEST].includes(item.name) || item.name.endsWith(".pyc")) continue;
    const path = join(dir, item.name);
    if (item.isSymbolicLink()) throw new Error(`Native installation does not follow symbolic links: ${path}`);
    const name = join(prefix, item.name);
    if (item.isDirectory()) for (const [key, value] of filesUnder(path, name)) files.set(key, value);
    else if (item.isFile()) files.set(name, readFileSync(path));
  }
  return files;
}

function rejectSymlink(path: string): void {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error(`Native installation does not replace symbolic links: ${path}`);
}

export type NativeBundle = { target: string; label: string; files: Map<string, Buffer>; previous: Record<string, string>; changed: boolean };

export function prepareNativeBundle(source: string, target: string, label: string, required: string[], force: boolean, skillsSource?: string, extraFiles: Record<string, string> = {}): NativeBundle {
  if (!required.every((name) => existsSync(join(source, name)))) throw new Error(`Bundled ${label} files are missing; reinstall AgentMemory before connecting.`);
  rejectSymlink(target);
  const files = filesUnder(source);
  if (skillsSource) {
    if (!["remember/SKILL.md", "recall/SKILL.md"].every((name) => existsSync(join(skillsSource, name)))) throw new Error("Bundled skills are missing; reinstall AgentMemory before connecting.");
    for (const [name, content] of filesUnder(skillsSource)) files.set(join("skills", name), content);
  }
  for (const [name, content] of Object.entries(extraFiles)) files.set(name, Buffer.from(content));
  let previous: Record<string, string> = {};
  if (existsSync(join(target, MANIFEST))) {
    let stored: unknown;
    try { stored = JSON.parse(readFileSync(join(target, MANIFEST), "utf8")); } catch { stored = null; }
    if (!record(stored) || !record(stored.files) || !Object.values(stored.files).every((hash) => typeof hash === "string")) throw new Error(`Invalid native install manifest in ${target}; restore its backup before reconnecting.`);
    previous = stored.files as Record<string, string>;
    for (const name of Object.keys(previous)) {
      const location = relative(target, resolve(target, name));
      if (!location || location === ".." || location.startsWith(`..${sep}`) || resolve(target, name) === resolve(target, MANIFEST)) throw new Error(`Invalid native install path in ${target}.`);
    }
  }
  const installed = existsSync(target) ? filesUnder(target) : new Map<string, Buffer>();
  if (!force) {
    for (const [name, content] of installed) {
      if (!files.has(name) && !(name in previous)) continue;
      if (previous[name] ? digest(content) !== previous[name] : !files.get(name)?.equals(content)) {
        throw new Error(`Customized ${label} file ${name} was preserved; use --force to replace it with a backup.`);
      }
    }
  }
  const changed = !existsSync(join(target, MANIFEST)) || [...files].some(([name, content]) => !installed.get(name)?.equals(content)) || Object.keys(previous).some((name) => !files.has(name) && installed.has(name));
  return { target, label, files, previous, changed };
}

export function installNativeBundles(bundles: NativeBundle[], configPath: string, configText: string): string | undefined {
  rejectSymlink(configPath);
  const transaction = randomUUID();
  const configStage = `${configPath}.stage-${transaction}`;
  const staged: { bundle: NativeBundle; stage: string; rollback: string; replaced: boolean; installed: boolean }[] = [];
  let backupPath: string | undefined;
  try {
    for (const bundle of bundles.filter((item) => item.changed)) {
      mkdirSync(dirname(bundle.target), { recursive: true });
      const stage = `${bundle.target}.stage-${transaction}`;
      const rollback = `${bundle.target}.previous-${transaction}`;
      const item = { bundle, stage, rollback, replaced: false, installed: false };
      staged.push(item);
      if (existsSync(bundle.target)) cpSync(bundle.target, stage, { recursive: true });
      else mkdirSync(stage);
      for (const name of Object.keys(bundle.previous)) if (!bundle.files.has(name)) rmSync(join(stage, name), { force: true });
      for (const [name, content] of bundle.files) {
        mkdirSync(dirname(join(stage, name)), { recursive: true });
        writeFileSync(join(stage, name), content);
      }
      writeFileSync(join(stage, MANIFEST), JSON.stringify({ files: Object.fromEntries([...bundle.files].map(([name, content]) => [name, digest(content)])) }) + "\n");
      if (existsSync(bundle.target)) {
        const backup = join(ensureBackupsDir(), `${bundle.label}-${transaction}`);
        cpSync(bundle.target, backup, { recursive: true });
        backupPath ??= backup;
      }
    }
    const configChanged = !existsSync(configPath) || readFileSync(configPath, "utf8") !== configText;
    if (configChanged && existsSync(configPath)) backupPath = backupFile(configPath, `native-config-${transaction}`, "config");
    if (configChanged) {
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configStage, configText, { mode: existsSync(configPath) ? lstatSync(configPath).mode & 0o777 : 0o600 });
    }
    for (const item of staged) {
      if (existsSync(item.bundle.target)) { renameSync(item.bundle.target, item.rollback); item.replaced = true; }
      renameSync(item.stage, item.bundle.target); item.installed = true;
    }
    if (configChanged) renameSync(configStage, configPath);
  } catch (error) {
    for (const item of [...staged].reverse()) {
      if (item.installed) rmSync(item.bundle.target, { recursive: true, force: true });
      if (item.replaced) renameSync(item.rollback, item.bundle.target);
    }
    throw error;
  } finally {
    for (const item of staged) rmSync(item.stage, { recursive: true, force: true });
    rmSync(configStage, { force: true });
  }
  for (const item of staged) rmSync(item.rollback, { recursive: true, force: true });
  return backupPath;
}
