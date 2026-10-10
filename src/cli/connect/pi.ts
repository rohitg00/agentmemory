import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as p from "@clack/prompts";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import { findPluginRoot } from "./codex-hooks.js";
import {
  backupFile,
  logAlreadyWired,
  logBackup,
  logInstalled,
  writeTextAtomic,
} from "./util.js";

// pi auto-discovers ~/.pi/agent/extensions/*/index.ts, so installing is a
// copy of the bundled extension; no settings.json edit.

const PI_DIR = join(homedir(), ".pi");
const PI_EXT_DIR = join(PI_DIR, "agent", "extensions", "agentmemory");
const DOCS = "https://github.com/rohitg00/agentmemory/tree/main/integrations/pi";
const EXT_FILES = ["index.ts", "security.ts"] as const;

function findPiSourceDir(): string | null {
  let packageRoot: string;
  try {
    packageRoot = dirname(findPluginRoot());
  } catch {
    return null;
  }
  const dir = join(packageRoot, "integrations", "pi");
  const complete = EXT_FILES.every((f) => existsSync(join(dir, f)));
  return complete ? dir : null;
}

export const adapter: ConnectAdapter = {
  name: "pi",
  displayName: "pi",
  category: "native",
  docs: DOCS,
  protocolNote:
    "→ Using native lifecycle hooks against the REST API at :3111 (recall on agent start, capture on agent end, memory tools). MCP not required.",

  detect(): boolean {
    return existsSync(PI_DIR);
  },

  async install(opts: ConnectOptions): Promise<ConnectResult> {
    const sourceDir = findPiSourceDir();
    if (!sourceDir) {
      p.log.error(
        "Bundled pi extension not found (integrations/pi missing from the install) — reinstall agentmemory.",
      );
      return { kind: "skipped", reason: "bundled-extension-missing" };
    }
    const sources = EXT_FILES.map((f) => ({
      name: f,
      content: readFileSync(join(sourceDir, f), "utf-8"),
      target: join(PI_EXT_DIR, f),
    }));

    const upToDate = sources.every(
      (s) => existsSync(s.target) && readFileSync(s.target, "utf-8") === s.content,
    );
    if (upToDate && !opts.force) {
      logAlreadyWired(this.displayName, PI_EXT_DIR);
      return { kind: "already-wired", mutatedPath: PI_EXT_DIR };
    }

    if (opts.dryRun) {
      p.log.info(
        `[dry-run] Would install the pi extension (${EXT_FILES.join(", ")}) into ${PI_EXT_DIR}`,
      );
      return { kind: "installed", mutatedPath: PI_EXT_DIR };
    }

    let backupPath: string | undefined;
    for (const s of sources) {
      if (existsSync(s.target) && readFileSync(s.target, "utf-8") !== s.content) {
        const backup = backupFile(s.target, `${this.name}-${s.name.replace(/\.ts$/, "")}`, "ts");
        logBackup(backup);
        backupPath ??= backup;
      }
    }

    mkdirSync(PI_EXT_DIR, { recursive: true });
    for (const s of sources) {
      writeTextAtomic(s.target, s.content);
    }

    const verified = sources.every(
      (s) => existsSync(s.target) && readFileSync(s.target, "utf-8") === s.content,
    );
    if (!verified) {
      p.log.error(`Verification failed: ${PI_EXT_DIR} does not match the bundled extension.`);
      return { kind: "skipped", reason: "verification-failed" };
    }

    logInstalled(this.displayName, PI_EXT_DIR);
    p.log.info(
      "pi auto-discovers the extension on next launch; a running pi picks it up with /reload. Verify with /agentmemory-status.",
    );
    return { kind: "installed", mutatedPath: PI_EXT_DIR, backupPath };
  },
};
