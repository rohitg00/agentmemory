import { resolve } from "node:path";
import { parseCli } from "./cli.js";
import { loadLongMemEval, stratifySample } from "./load.js";
import { runEvaluation } from "./run.js";

async function main(): Promise<void> {
  const options = parseCli("longmemeval", process.env.LONGMEMEVAL_PATH ?? "");
  if (!options.data) throw new Error("--data <longmemeval.json> is required");
  const data = resolve(options.data);
  let questions = loadLongMemEval(data);
  if (options.stratify) questions = stratifySample(questions, options.stratify);
  if (options.limit) questions = questions.slice(0, options.limit);
  const rows = await runEvaluation({ ...options, benchmark: "longmemeval", questions, datasetFiles: [data] });
  if (rows.some((r) => r.status === "error")) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
