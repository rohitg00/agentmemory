import Link from "next/link";
import { LONGMEMEVAL, src } from "@/lib/site";
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
          <h2 id="benchmarks-title">It finds the right session, and sends less.</h2>
          <p>
            Retrieval measured on LongMemEval-S, an academic benchmark for long-term memory, with a local embedding
            model and no API key. Every number below links to the file it came from.
          </p>
        </div>

        <Reveal>
          <QuestionDots />
        </Reveal>
        <p className={s.cite}>
          <a className="src" href={src.longmemeval} target="_blank" rel="noreferrer">
            benchmark/LONGMEMEVAL.md
          </a>
          <span>
            {LONGMEMEVAL.questions} questions, about 48 sessions each. Retrieval recall, not end-to-end answer accuracy.
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
              , then run the same script we did. Embeddings use {LONGMEMEVAL.embedding}. The benchmark is described in
              the{" "}
              <a className="src" href={src.paper} target="_blank" rel="noreferrer">
                LongMemEval paper
              </a>
              .
            </p>
          </div>
          <div className={s.cmds}>
            <CopyButton text={REPRODUCE.hybrid} label="Copy the hybrid benchmark command" className={s.cmd}>
              <span className={s.prompt} aria-hidden="true">
                $
              </span>
              <code>{REPRODUCE.hybrid}</code>
            </CopyButton>
            <CopyButton text={REPRODUCE.bm25} label="Copy the BM25-only benchmark command" className={s.cmd}>
              <span className={s.prompt} aria-hidden="true">
                $
              </span>
              <code>{REPRODUCE.bm25}</code>
            </CopyButton>
            <Link className="btn btn-ghost" href="/benchmarks">
              Full methodology and cost budgets
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
