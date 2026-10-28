import Link from "next/link";
import { src } from "@/lib/site";
import { REPRODUCE } from "@/lib/bench";
import { CopyButton, Reveal } from "./client";
import { QuestionDots } from "./BenchFigures";
import s from "./Benchmarks.module.css";

export function Benchmarks() {
  return (
    <section id="benchmarks" className="section" aria-labelledby="benchmarks-title">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Benchmarks</span>
          <h2 id="benchmarks-title">Every required source, counted explicitly.</h2>
          <p>
            The 2026-10-28 run compares the production BM25 component with a lexical baseline on the same
            LongMemEval-S sessions. No model API, embeddings or answer generator.
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
            500 questions per adapter, zero execution failures. 30 unanswerable questions excluded from retrieval metrics.
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
              , then run the same evaluation. The pinned dataset and checksum are in the report. See the
              the{" "}
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
