#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { GitHubIssueWatcher, GitHubSyncError } from "./watcher.mjs";

export async function main(args = process.argv.slice(2), env = process.env) {
  const { values } = parseArgs({ args, options: {
    help: { type: "boolean" }, repo: { type: "string" }, project: { type: "string" },
    cwd: { type: "string" }, url: { type: "string" }, since: { type: "string" },
    "max-pages": { type: "string" },
  } });
  if (values.help) {
    process.stdout.write("Usage: node integrations/github-watcher/bin.mjs --repo owner/repo --project hook-project [--cwd checkout] [--url http://localhost:3111] [--since UTC] [--max-pages 10]\n\nExplicit one-shot public-issue prototype. No daemon, private sync, durable cursor or package release. GH_TOKEN, GITHUB_TOKEN or gh auth token authenticates GitHub; AGENTMEMORY_SECRET authenticates the separate destination. Project may also use AGENTMEMORY_PROJECT_NAME.\n");
    return;
  }
  let githubToken = env.GH_TOKEN || env.GITHUB_TOKEN || "";
  if (!githubToken) {
    try {
      githubToken = execFileSync("gh", ["auth", "token", "--hostname", "github.com"], {
        encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000,
      }).trim();
    } catch {}
  }
  const watcher = new GitHubIssueWatcher({
    repo: values.repo, project: values.project || env.AGENTMEMORY_PROJECT_NAME,
    cwd: resolve(values.cwd || process.cwd()), baseUrl: values.url || env.AGENTMEMORY_URL || "http://localhost:3111",
    githubToken, secret: env.AGENTMEMORY_SECRET || "", since: values.since,
    maxPages: values["max-pages"] === undefined ? 10 : Number(values["max-pages"]),
  });
  process.stdout.write(`${JSON.stringify(await watcher.syncOnce())}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    const report = error instanceof GitHubSyncError ?
      { complete: false, error: error.message, progress: error.progress, ...error.details } :
      { complete: false, error: "Invalid connector options; see --help" };
    process.stderr.write(`${JSON.stringify(report)}\n`);
    process.exitCode = 1;
  });
}
