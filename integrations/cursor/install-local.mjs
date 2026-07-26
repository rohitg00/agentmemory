#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const INTEGRATION_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = resolve(INTEGRATION_ROOT, '../..');
const CURSOR_DIR = join(homedir(), '.cursor');
const ENV_PATH = join(homedir(), '.agentmemory', '.env');
const MCP_PATH = join(CURSOR_DIR, 'mcp.json');
const HOOKS_PATH = join(CURSOR_DIR, 'hooks.json');
const MARKETPLACE_NAME = 'local-agentmemory';
const MARKETPLACE_DIR = join(CURSOR_DIR, 'plugins', 'marketplaces', MARKETPLACE_NAME);
const LEGACY_MARKETPLACE_DIR = join(CURSOR_DIR, 'plugins', 'marketplaces', 'local-agentmemory-cursor');

function loadEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

function readJson(path) {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

function linkMarketplace() {
  mkdirSync(dirname(MARKETPLACE_DIR), { recursive: true });
  if (!existsSync(MARKETPLACE_DIR)) {
    if (process.platform === 'win32') {
      execSync(`cmd /c mklink /J "${MARKETPLACE_DIR}" "${REPO_ROOT}"`, { stdio: 'inherit' });
    } else {
      execSync(`ln -s "${REPO_ROOT}" "${MARKETPLACE_DIR}"`, { stdio: 'inherit' });
    }
  }
}

function mergeMcp(env) {
  const mcp = readJson(MCP_PATH);
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
  if (existsSync(MCP_PATH)) copyFileSync(MCP_PATH, backup);
  writeJson(MCP_PATH, mcp);
  return backup;
}

function disableUserHooks() {
  if (!process.argv.includes('--clear-user-hooks')) return null;
  if (!existsSync(HOOKS_PATH)) return null;
  const hooks = readJson(HOOKS_PATH);
  const hasAgentmemory = JSON.stringify(hooks).includes('agentmemory-');
  if (!hasAgentmemory) return null;
  const backup = `${HOOKS_PATH}.pre-plugin-${Date.now()}.bak`;
  copyFileSync(HOOKS_PATH, backup);
  writeJson(HOOKS_PATH, { version: 1, hooks: {} });
  return backup;
}

const env = loadEnv(ENV_PATH);
if (!env.AGENTMEMORY_URL || !env.AGENTMEMORY_SECRET) {
  console.error('Missing ~/.agentmemory/.env with AGENTMEMORY_URL and AGENTMEMORY_SECRET');
  process.exit(1);
}

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
console.log('AGENTMEMORY_SECRET: <set, not printed>');
console.log('\nNext steps:');
console.log('1. Cursor → Settings → Plugins → Add marketplace from folder:');
console.log(`   ${REPO_ROOT}`);
console.log('   (repo root — must contain .cursor-plugin/marketplace.json)');
console.log('2. Enable plugin: agentmemory');
console.log('3. Disable the old rohitg00/agentmemory marketplace plugin if both are enabled.');
console.log('4. Developer: Reload Window');
console.log('5. Run: node integrations/cursor/verify-flow.mjs');
console.log('6. In hooks log, confirm commands use ${CURSOR_PLUGIN_ROOT}/scripts/cursor/');
console.log('\nOnly after plugin hooks are confirmed:');
console.log('  node integrations/cursor/install-local.mjs --clear-user-hooks');
