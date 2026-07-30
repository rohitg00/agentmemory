import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

let fileEnv: Record<string, string> | undefined;

function loadHookEnvFile(): Record<string, string> {
  if (fileEnv) return fileEnv;

  const vars: Record<string, string> = {};
  const dataDir = process.env["AGENTMEMORY_DATA_DIR"] || join(homedir(), ".agentmemory");
  const envPath = join(dataDir, ".env");
  if (!existsSync(envPath)) {
    fileEnv = vars;
    return vars;
  }

  try {
    for (const line of readFileSync(envPath, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;

      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      const quote = value[0] === '"' || value[0] === "'" ? value[0] : "";
      if (quote) {
        const closeIdx = value.indexOf(quote, 1);
        if (closeIdx !== -1) value = value.slice(1, closeIdx);
      } else {
        const commentIdx = value.indexOf(" #");
        if (commentIdx !== -1) value = value.slice(0, commentIdx).trim();
      }
      vars[key] = value;
    }
  } catch {
    // Hooks must fail open when the optional env file cannot be read.
  }

  fileEnv = vars;
  return vars;
}

/** Process env wins; hook subprocesses fall back to ~/.agentmemory/.env. */
export function getHookEnv(key: string): string | undefined {
  return process.env[key] ?? loadHookEnvFile()[key];
}
