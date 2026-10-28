import type { Metadata } from "next";
import { DocPage, Prose } from "@/components/site/Doc";
import { QuestionDots } from "@/components/site/BenchFigures";
import { REPO_URL, src } from "@/lib/site";
import { ADAPTERS, ADAPTER_LABELS, EVALUATION, REPRODUCE, percent } from "@/lib/bench";
import s from "./page.module.css";

export const metadata: Metadata = {
  title: "Benchmarks",
  description: "Reproducible retrieval evaluation with strict recall-all, coverage, baselines and limitations.",
  alternates: { canonical: "/benchmarks" },
};

export default function BenchmarksPage() {
  return <DocPage eyebrow="Benchmarks" title="Complete evidence, measured in the open."
    lede="AgentMemory 0.9.31 development checkout, measured on 2026-10-28. Every result has a dataset fingerprint and per-question receipts.">
    <div className={s.figure}><QuestionDots /></div>
    <Prose>
      <h2>What the scores mean</h2>
      <p>Strict recall-all@5 requires every gold source session in the first five distinct results. Fractional recall measures how much of the required evidence was found. Any-hit needs just one source.</p>
      <p>Each question builds a fresh index over its supplied sessions. This run tests the production BM25 SearchIndex and a token-overlap grep baseline. It does not run the daemon, capture hooks, compression, vectors, graph or an answer-generating model.</p>
      <p>All 1,000 LongMemEval adapter attempts completed with zero execution failures. Each adapter saw 470 answerable and 30 unanswerable questions. Unanswerable questions count toward coverage, but have no retrieval score; abstention quality is not measured.</p>
      <p>Multi-session questions remain the weakest BM25 category: 86/121 strict successes (71.1%). Finding one relevant session can still leave an answer without all its evidence.</p>
      <p><a href={src.longmemeval}>Full report, per-type results, manifests and compressed per-question receipts</a>.</p>

      <h2>Coding-session regression fixture</h2>
      <div className={s.tableWrap}><table>
        <thead><tr><th>Adapter</th><th>Strict recall-all@5</th><th>Completed</th><th>Failures</th></tr></thead>
        <tbody>{ADAPTERS.map((adapter) => {
          const r = EVALUATION.coding.byAdapter[adapter];
          return <tr key={adapter}><td>{ADAPTER_LABELS[adapter]}</td><td>{percent(r.recallAll)}</td><td>{r.completed}/{r.n}</td><td>{r.failed}</td></tr>;
        })}</tbody>
      </table></div>
      <p>The coding-agent-life-v1 fixture has only 15 questions. Grep scores 15/15 and BM25 14/15. This is useful regression coverage, not evidence that a system wins across coding workloads.</p>

      <h2>Reproduce</h2>
      <p>From the repository root with dependencies installed, download the pinned public dataset:</p>
      <pre><code>{REPRODUCE.download}</code></pre>
      <p>Expected SHA256: <code>d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442</code>.</p>
      <pre><code>{`${REPRODUCE.retrieval}\n${REPRODUCE.coding}`}</code></pre>
      <p>The loader strips answer labels, uses opaque IDs, retains dates and coalesces 13 identical repeated distractor IDs. See the <a href={src.evaluation}>evaluation guide</a> for the complete input and scoring contract.</p>

      <h2>Release improvements and runtime checks</h2>
      <p>0.9.31 adds scoped saved-memory recall, incremental summaries, paged exports, validated imports and native Pi, OMP and DeepSeek Harness integrations, alongside compression and recovery fixes. <a href={`${src.releases}/tag/v0.9.31`}>Release notes</a>.</p>
      <p>Lifecycle and packaged startup/restart behavior are checked separately by the <a href={src.evaluation}>live evaluation suites</a> and <a href={src.gate}>release gate</a>. The component results above do not certify those paths or establish a speedup over the previous release.</p>

      <h2>Historical measurements</h2>
      <ul>
        <li><a href={`${REPO_URL}/blob/main/benchmark/LONGMEMEVAL.md`}>Hybrid LongMemEval experiment</a>: older any-hit scoring and input pipeline, not comparable to strict recall-all.</li>
        <li><a href={src.tokens}>v0.6.0 token experiment</a>: fixture-specific context savings, not a per-session guarantee.</li>
        <li><a href={src.agentLife}>May coding-session benchmark</a>: older full-runtime experiment.</li>
        <li><a href={`${REPO_URL}/blob/main/benchmark/capture-costs-budgets.json`}>Capture-cost budgets</a>: machine-dependent regression ceilings, not typical latency or a current speed claim.</li>
      </ul>
      <p>We have not run a matched evaluation of the other memory products. Compare products by <a href="/vs">deployment and use case</a>; answer accuracy, retrieval recall and token use require different measurements.</p>
    </Prose>
  </DocPage>;
}
