#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const docsOnly = (path) => /\.mdx?$/.test(path) || /^(?:docs|assets|website)\//.test(path);
const sha = (value) => typeof value === "string" && /^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(value);

function classify() {
  const name = process.env.GITHUB_EVENT_NAME;
  if (name === "workflow_dispatch") return { runTests: true, reason: "manual dispatch" };
  if (name !== "push" && name !== "pull_request") return { runTests: true, reason: "unrecognized event" };
  try {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    const base = name === "pull_request" ? event.pull_request?.base?.sha : event.before;
    const head = process.env.GITHUB_SHA;
    if (!sha(base) || !sha(head) || /^0+$/.test(base)) return { runTests: true, reason: "no comparable base" };
    const paths = execFileSync("git", ["diff", "--name-only", "--no-renames", "-z", base, head, "--"], {
      encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
    }).split("\0").filter(Boolean);
    return { runTests: paths.some((path) => !docsOnly(path)), reason: "changed paths", paths };
  } catch {
    // Missing history or malformed event data must never silently skip source tests.
    return { runTests: true, reason: "change detection unavailable" };
  }
}

const result = classify();
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `run_tests=${result.runTests}\n`);
console.log(JSON.stringify(result));
