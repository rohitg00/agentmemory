import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as p from "@clack/prompts";
import type { ConnectAdapter, ConnectOptions, ConnectResult } from "./types.js";
import { findPluginRoot } from "./codex-hooks.js";
import { backupFile, logAlreadyWired, logBackup, logInstalled } from "./util.js";

// pi auto-discovers ~/.pi/agent/extensions/*/index.ts, so installing is a
// copy of the bundled extension; no settings.json edit.

const PI_DIR = join(homedir(), ".pi");
const PI_EXT_DIR = join(PI_DIR, "agent", "extensions", "agentmemory");
const DOCS = "https://github.com/rohitg00/agentmemory/tree/main/integrations/pi";
const EXT_FILES = ["index.ts", "security.ts"] as const;

function findPiSourceDir(): string {
  const packageRoot = dirname(findPluginRoot());
  const dir = join(packageRoot, "integrations", "pi");
  if (!existsSync(join(dir, "index.ts"))) {
    throw new Error(
      `agentmemory: bundled pi extension not found at ${dir} — reinstall the package`,
    );
  }
  return dir;
}

function writeAtomic(path: string, content: string): void {
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, content, "utf-8");
  renameSync(tmpPath, path);
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
    const existingIndex = join(PI_EXT_DIR, "index.ts");
    if (existsSync(existingIndex)) {
      backupPath = backupFile(existingIndex, this.name, "ts");
      logBackup(backupPath);
    }

    mkdirSync(PI_EXT_DIR, { recursive: true });
    for (const s of sources) {
      writeAtomic(s.target, s.content);
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
