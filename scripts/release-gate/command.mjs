import assert from "node:assert/strict";
import { spawn } from "node:child_process";

export function assertSupportedPlatform() {
  assert.notEqual(process.platform, "win32", "Native integration gates require macOS, Linux, or WSL2");
}

export function killProcess(pid) {
  if (!pid) return;
  try { process.kill(-pid, "SIGKILL"); } catch {}
  try { process.kill(pid, "SIGKILL"); } catch {}
}

export function runCommand(executable, args, { env, cwd, children = new Set(), timeoutMs = 90_000 } = {}) {
  assertSupportedPlatform();
  return new Promise((done) => {
    const child = spawn(executable, args, { env, cwd, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    if (child.pid) children.add(child.pid);
    let output = "";
    let timedOut = false;
    let error;
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { output += data; });
    const timer = setTimeout(() => {
      timedOut = true;
      output += `\nCommand timed out after ${timeoutMs}ms\n`;
      killProcess(child.pid);
    }, timeoutMs);
    child.on("error", (cause) => { error = cause.message; output += error; });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      children.delete(child.pid);
      done({ code, signal, timedOut, error, output });
    });
  });
}

export function assertCommandCompleted(result) {
  assert(!result.timedOut, result.output);
  assert(!result.error, result.error);
  assert.equal(result.signal, null, `Command terminated by ${result.signal}: ${result.output}`);
}

export function assertValidationRejected(result) {
  assertCommandCompleted(result);
  assert(Number.isInteger(result.code) && result.code > 0, `Expected a nonzero validator exit code, got ${result.code}: ${result.output}`);
}
