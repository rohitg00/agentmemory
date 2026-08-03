#!/usr/bin/env node
import { FilesystemWatcher, configFromEnv } from "./watcher.mjs";

const cliArgs = process.argv.slice(2);
const envCfg = configFromEnv(process.env);

const roots = cliArgs.length > 0 ? cliArgs : envCfg.roots;
if (!roots || roots.length === 0) {
  process.stderr.write(
    "agentmemory-fs-watcher: no directories to watch.\n" +
      "Usage: agentmemory-fs-watcher <dir> [<dir>...]\n" +
      "Or set AGENTMEMORY_FS_WATCH_DIRS=path1,path2\n",
  );
  process.exit(2);
}

const watcher = new FilesystemWatcher({ ...envCfg, roots });
watcher.start();
process.stderr.write(
  `[fs-watcher] emitting to ${envCfg.baseUrl || "http://localhost:3111"}\n`,
);

let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await watcher.stop();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
