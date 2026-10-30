import Link from "next/link";
import { src } from "@/lib/site";
import { EVALUATION, REPRODUCE, percent } from "@/lib/bench";
import { CopyButton, Reveal } from "./client";
import { QuestionDots } from "./BenchFigures";
import s from "./Benchmarks.module.css";

export function Benchmarks() {
  const bm25 = EVALUATION.longmemeval.byAdapter["agentmemory-bm25-component"];
  const baseline = EVALUATION.longmemeval.byAdapter.grep;
  const improvement = ((bm25.recallAll - baseline.recallAll) * 100).toFixed(1);
  return (
    <section id="benchmarks" className="section" aria-labelledby="benchmarks-title">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Benchmarks</span>
          <h2 id="benchmarks-title">Useful recall. No model API required.</h2>
          <p>
            Keyless BM25 finds every required source for {percent(bm25.recallAll)} of answerable LongMemEval-S questions,
            {" "}{improvement} percentage points above the lexical baseline on the same inputs.
            At least one relevant source is found for {percent(bm25.hit / bm25.scored)}. No embedding model or paid API.
          </p>
        </div>

        <Reveal>
          <QuestionDots />
        </Reveal>
        <p className={s.cite}>
          <a className="src" href={src.longmemeval} target="_blank" rel="noreferrer">
            Results and per-question receipts
          </a>
          <span>
            {bm25.n} questions per adapter, {EVALUATION.longmemeval.failed} execution failures.
            {" "}{bm25.unanswerable} unanswerable questions excluded from retrieval metrics.
          </span>
        </p>

        <div className={s.reproduce}>
          <div>
            <span className="eyebrow">Reproduce it</span>
            <p className={s.reproText}>
              Download the dataset from{" "}
              <a className="src" href={src.dataset} target="_blank" rel="noreferrer">
                Hugging Face
              </a>
              , then run the same evaluation. The pinned dataset and checksum are in the report. See the{" "}
              <a className="src" href={src.paper} target="_blank" rel="noreferrer">
                LongMemEval paper
              </a>
              .
            </p>
          </div>
          <div className={s.cmds}>
            <CopyButton text={REPRODUCE.retrieval} label="Copy the LongMemEval evaluation command" className={s.cmd}>
              <span className={s.prompt} aria-hidden="true">
                $
              </span>
              <code>{REPRODUCE.retrieval}</code>
            </CopyButton>
            <CopyButton text={REPRODUCE.coding} label="Copy the coding fixture evaluation command" className={s.cmd}>
              <span className={s.prompt} aria-hidden="true">
                $
              </span>
              <code>{REPRODUCE.coding}</code>
            </CopyButton>
            <Link className="btn btn-ghost" href="/benchmarks">
              Methodology, limitations and historical results
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
