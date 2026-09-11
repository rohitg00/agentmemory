import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { registerWorker } from "iii-sdk";

const ENGINE_WS = "ws://127.0.0.1:49134";
const STATE_DIR = path.join(os.homedir(), "Library/Application Support/agentmemory/state_store.db");

function parseFile(filePath) {
  const raw = fs.readFileSync(filePath);
  const cut = raw.lastIndexOf(0x7d);
  if (cut === -1) return null;
  try { return JSON.parse(raw.slice(0, cut + 1).toString("utf8")); } catch (e) { console.error(`parse fail ${filePath}: ${e.message}`); return null; }
}

const sdk = registerWorker(ENGINE_WS, {});
// Wait a moment for connection
await new Promise(r => setTimeout(r, 1500));

console.log("SDK ready, starting sessions population");
const sessionsBin = path.join(STATE_DIR, "mem%3Asessions.bin");
const sessionsObj = parseFile(sessionsBin);
if (!sessionsObj) throw new Error("no sessions obj");
const sessions = Object.values(sessionsObj);
console.log(`Sessions to push: ${sessions.length}`);
let pushedSessions = 0;
for (let i = 0; i < sessions.length; i += 50) {
  const batch = sessions.slice(i, i + 50);
  await Promise.all(batch.map(s =>
    sdk.trigger({ function_id: "state::set", payload: { scope: "mem:sessions", key: s.id, value: s } }).catch(e => console.error(`session ${s.id} fail: ${e.message}`))
  ));
  pushedSessions += batch.length;
  if (i % 500 === 0) console.log(`  sessions ${pushedSessions}/${sessions.length}`);
}
console.log(`Sessions done: ${pushedSessions}`);

const obsFiles = fs.readdirSync(STATE_DIR).filter(f => f.startsWith("mem%3Aobs%3A") && f.endsWith(".bin"));
console.log(`Obs files: ${obsFiles.length}`);
let totalObs = 0, filesOk = 0, filesFail = 0;
for (const fname of obsFiles) {
  const fpath = path.join(STATE_DIR, fname);
  const obj = parseFile(fpath);
  if (!obj || typeof obj !== "object") { filesFail++; continue; }
  const scope = decodeURIComponent(fname.replace(".bin",""));
  const entries = Object.entries(obj);
  for (let i = 0; i < entries.length; i += 50) {
    const batch = entries.slice(i, i + 50);
    await Promise.all(batch.map(([k, v]) =>
      sdk.trigger({ function_id: "state::set", payload: { scope, key: k, value: v } }).catch(e => console.error(`obs ${scope}/${k} fail: ${e.message}`))
    ));
  }
  totalObs += entries.length;
  filesOk++;
  if (filesOk % 200 === 0) console.log(`  obs files ${filesOk}/${obsFiles.length} totalObs ${totalObs}`);
}
console.log(`Obs done: filesOk=${filesOk} filesFail=${filesFail} totalObs=${totalObs}`);

// Verify via REST
await new Promise(r => setTimeout(r, 1000));
try {
  const res = await fetch("http://127.0.0.1:3111/agentmemory/sessions");
  const json = await res.json();
  const count = Array.isArray(json) ? json.length : (json.sessions?.length ?? json.count ?? 0);
  console.log(`REST /sessions count: ${count} status:${res.status}`);
} catch (e) { console.error("sessions REST fail", e.message); }

try {
  const res = await fetch("http://127.0.0.1:3111/agentmemory/observations?limit=1");
  const json = await res.json();
  console.log(`REST /observations?limit=1: ${JSON.stringify(json).slice(0,600)}`);
} catch (e) { console.error("observations REST fail", e.message); }

try {
  const res = await fetch("http://127.0.0.1:3111/agentmemory/health");
  if (res.ok) {
    const j = await res.json();
    console.log(`health: ${JSON.stringify(j).slice(0,500)}`);
  } else console.log(`health status ${res.status}`);
} catch (e) { console.error("health fail", e.message); }

// Heap via status if available, else skip
process.exit(0);
