#!/usr/bin/env node
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, requireConnection } from './_env.mjs';

const INTEGRATION_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(INTEGRATION_ROOT, '../..');
const CURSOR_DIR = join(homedir(), '.cursor');
const MCP_PATH = join(CURSOR_DIR, 'mcp.json');
const HOOKS_PATH = join(CURSOR_DIR, 'hooks.json');
const MARKETPLACE_NAME = 'local-agentmemory';
const MARKETPLACE_DIR = join(CURSOR_DIR, 'plugins', 'marketplaces', MARKETPLACE_NAME);
const LEGACY_MARKETPLACE_DIR = join(CURSOR_DIR, 'plugins', 'marketplaces', 'local-agentmemory-cursor');

function readJson(path) {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (err) {
    throw new Error(`Cannot parse ${path}: ${err.message}`);
  }
}

function writeJson(path, data, restrictPermissions = false) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  if (restrictPermissions) {
    try {
      chmodSync(path, 0o600);
    } catch {}
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function describeJsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function requireObjectConfig(path, value, label) {
  if (!isPlainObject(value)) {
    console.error(`${path}: expected ${label} to be a JSON object, got ${describeJsonType(value)}`);
    process.exit(1);
  }
}

function requireObjectField(path, fieldName, value) {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    console.error(`${path}: expected "${fieldName}" to be a JSON object, got ${describeJsonType(value)}`);
    process.exit(1);
  }
}

function linkMarketplace() {
  mkdirSync(dirname(MARKETPLACE_DIR), { recursive: true });
  if (!existsSync(MARKETPLACE_DIR)) {
    symlinkSync(REPO_ROOT, MARKETPLACE_DIR, process.platform === 'win32' ? 'junction' : 'dir');
  }
}

function mergeMcp(env) {
  let mcp;
  try {
    mcp = existsSync(MCP_PATH) ? readJson(MCP_PATH) : {};
  } catch (err) {
    console.error(err.message);
    console.error('Refusing to overwrite mcp.json. Fix the file or restore from backup.');
    process.exit(1);
  }
  requireObjectConfig(MCP_PATH, mcp, 'mcp.json root');
  requireObjectField(MCP_PATH, 'mcpServers', mcp.mcpServers);
  if (!mcp.mcpServers) mcp.mcpServers = {};
  mcp.mcpServers.agentmemory = {
    command: 'npx',
    args: ['-y', '@agentmemory/mcp'],
    env: {
      AGENTMEMORY_URL: env.AGENTMEMORY_URL || 'http://localhost:3111',
      AGENTMEMORY_SECRET: env.AGENTMEMORY_SECRET || '',
      AGENTMEMORY_TOOLS: env.AGENTMEMORY_TOOLS || 'all',
    },
  };
  const backup = `${MCP_PATH}.bak-${Date.now()}`;
  if (existsSync(MCP_PATH)) {
    copyFileSync(MCP_PATH, backup);
    try {
      chmodSync(backup, 0o600);
    } catch {}
  }
  writeJson(MCP_PATH, mcp, true);
  return backup;
}

function isAgentmemoryHook(entry) {
  if (typeof entry?.command !== 'string') return false;
  const args = entry.command.match(/^\s*(?:"([^"]+)"|'([^']+)'|(\S+))\s+(?:"([^"]+)"|'([^']+)'|(\S+))(?:\s|$)/);
  if (!args) return false;
  const executable = (args[1] || args[2] || args[3]).replace(/\\/g, '/');
  if (!/(?:^|\/)node(?:\.exe)?$/.test(executable)) return false;
  const argument = args[4] || args[5] || args[6];
  const script = (existsSync(argument) ? realpathSync(argument) : argument).replace(/\\/g, '/');
  const roots = [REPO_ROOT.replace(/\\/g, '/'), '${CURSOR_PLUGIN_ROOT}'];
  const hooks = ['session-start', 'prompt-submit', 'pre-tool-use', 'post-tool-use', 'post-tool-failure', 'pre-compact', 'subagent-start', 'subagent-stop', 'stop', 'session-end', 'cursor/run-hook', 'cursor/run-detached'];
  return roots.some(root => hooks.some(hook => script === `${root}/plugin/scripts/${hook}.mjs`));
}

function disableUserHooks() {
  if (!process.argv.includes('--clear-user-hooks')) return null;
  if (!existsSync(HOOKS_PATH)) return null;
  let hooks;
  try {
    hooks = readJson(HOOKS_PATH);
  } catch (err) {
    console.error(err.message);
    console.error('Refusing to clear hooks.json until the file is valid JSON.');
    process.exit(1);
  }
  requireObjectConfig(HOOKS_PATH, hooks, 'hooks.json root');
  requireObjectField(HOOKS_PATH, 'hooks', hooks.hooks);
  if (!hooks.hooks) return null;

  let removed = 0;
  const filtered = {};
  for (const [event, entries] of Object.entries(hooks.hooks)) {
    if (!Array.isArray(entries)) {
      filtered[event] = entries;
      continue;
    }
    const kept = entries.filter((entry) => !isAgentmemoryHook(entry));
    removed += entries.length - kept.length;
    if (kept.length > 0) filtered[event] = kept;
  }
  if (removed === 0) return null;

  const backup = `${HOOKS_PATH}.pre-plugin-${Date.now()}.bak`;
  copyFileSync(HOOKS_PATH, backup);
  writeJson(HOOKS_PATH, { ...hooks, hooks: filtered });
  return backup;
}

const { url, secret } = requireConnection();
const env = { ...loadConfig(['AGENTMEMORY_TOOLS']), AGENTMEMORY_URL: url, AGENTMEMORY_SECRET: secret };

linkMarketplace();
const mcpBackup = mergeMcp(env);
const hooksBackup = disableUserHooks();

console.log('\nagentmemory Cursor plugin (local dev) wired.\n');
console.log(`Repo root: ${REPO_ROOT}`);
console.log(`Plugin package: ${join(REPO_ROOT, 'plugin')}`);
console.log(`Marketplace junction: ${MARKETPLACE_DIR}`);
if (existsSync(LEGACY_MARKETPLACE_DIR)) {
  console.log(`Legacy junction still present: ${LEGACY_MARKETPLACE_DIR}`);
  console.log('  Remove it in Cursor Settings → Plugins if you added marketplace from integrations/cursor before.');
}
if (mcpBackup) console.log(`mcp.json backup: ${mcpBackup}`);
if (hooksBackup) console.log(`hooks.json backup: ${hooksBackup}`);
console.log(`AGENTMEMORY_URL: ${env.AGENTMEMORY_URL}`);
console.log(`AGENTMEMORY_SECRET: ${env.AGENTMEMORY_SECRET ? '<set, not printed>' : '<not configured>'}`);
console.log('\nNext steps:');
console.log('1. Cursor → Settings → Plugins → Add marketplace from folder:');
console.log(`   ${REPO_ROOT}`);
console.log('   (repo root — must contain .cursor-plugin/plugin.json)');
console.log('2. Enable plugin: agentmemory');
console.log('3. Disable any second agentmemory marketplace entry if both are enabled.');
console.log('4. Developer: Reload Window');
console.log('5. Run: node integrations/cursor/verify-flow.mjs');
console.log('6. In hooks log, confirm commands use plugin/scripts/cursor/run-hook.mjs');
console.log('\nOnly after plugin hooks are confirmed:');
console.log('  node integrations/cursor/install-local.mjs --clear-user-hooks');
