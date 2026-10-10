import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCli } from "./cli.js";
import { isolateQuestion, stratifySample } from "./load.js";
import { runEvaluation } from "./run.js";
import type { Question, Session } from "./types.js";

async function main(): Promise<void> {
  const options = parseCli("coding-life", "eval/data/coding-agent-life-v1");
  const sessionsPath = resolve(options.data, "sessions.json");
  const queriesPath = resolve(options.data, "queries.json");
  const sessions = JSON.parse(readFileSync(sessionsPath, "utf8")) as Session[];
  const queries = JSON.parse(readFileSync(queriesPath, "utf8")) as Omit<Question, "haystack">[];
  let questions = queries.map((q) => isolateQuestion({ ...q, haystack: sessions }));
  if (options.stratify) questions = stratifySample(questions, options.stratify);
  if (options.limit) questions = questions.slice(0, options.limit);
  const rows = await runEvaluation({ ...options, benchmark: "coding-agent-life-v1", questions,
    datasetFiles: [sessionsPath, queriesPath] });
  if (rows.some((r) => r.status === "error")) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
