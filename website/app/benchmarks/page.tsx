import type { Metadata } from "next";
import { DocPage, Prose } from "@/components/site/Doc";
import { QuestionDots } from "@/components/site/BenchFigures";
import { LONGMEMEVAL, TOKENS, src } from "@/lib/site";
import { BUDGETS, RECOVERY_FACTS, REPRODUCE, TOKEN_SETUP, TYPE_HITS, benchSrc } from "@/lib/bench";
import s from "./page.module.css";

export const metadata: Metadata = {
  title: "Benchmarks",
  description:
    "How agentmemory is measured: LongMemEval-S retrieval recall, token cost per query, crash recovery and the resource budgets the cost bench enforces. Every number links to its source file.",
  alternates: { canonical: "/benchmarks" },
};

const pct = (n: number) => `${n.toFixed(1)}%`;
const mib = (kib: number) => `${(kib / 1024).toFixed(0)} MiB`;
const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`;
const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

const TOKEN_ROWS = [
  { name: "Load every observation", r5: 37.0, r10: 55.8, p5: 78.0, ndcg: 80.3, mrr: 82.5, tokens: TOKENS.fullContext },
  { name: "BM25 only, keyless", r5: 43.8, r10: 55.9, p5: 95.0, ndcg: 82.7, mrr: 95.5, tokens: TOKENS.agentmemory },
  { name: "BM25 + local vectors", r5: 43.8, r10: 64.1, p5: 98.0, ndcg: 94.9, mrr: 100.0, tokens: TOKENS.agentmemory },
];

function Src({ href, children }: { href: string; children: string }) {
  return (
    <a className="src" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export default function BenchmarksPage() {
  return (
    <DocPage
      eyebrow="Benchmarks"
      title="Measured in the open, reproducible on your machine."
      lede="Retrieval quality, token cost, crash recovery and resource budgets. Each table names the file it comes from and the command that regenerates it."
    >
      <div className={s.figure}>
        <QuestionDots />
      </div>

      <Prose>
        <h2>What is measured</h2>
        <ul>
          <li>
            <strong>Dataset.</strong> LongMemEval-S: {LONGMEMEVAL.questions} questions, about 48 sessions and 115K tokens
            per question. <Src href={src.dataset}>dataset</Src> <Src href={src.paper}>paper</Src>
          </li>
          <li>
            <strong>Metric.</strong> recall_any@K: does any gold session appear in the top K results. Each question builds
            a fresh index from its own sessions and searches with the question text.
          </li>
          <li>
            <strong>Embeddings.</strong> {LONGMEMEVAL.embedding}. No API key and no LLM in the loop.
          </li>
          <li>
            <strong>What it is not.</strong> This is retrieval recall, not end-to-end answer accuracy. The official
            LongMemEval score adds answer generation and an LLM judge, and we do not claim one.
          </li>
        </ul>

        <h2>Retrieval recall</h2>
        <div className={s.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Mode</th>
                <th>R@5</th>
                <th>R@10</th>
                <th>R@20</th>
                <th>NDCG@10</th>
                <th>MRR</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: "BM25 + vectors", d: LONGMEMEVAL.hybrid },
                { name: "BM25 only, keyless", d: LONGMEMEVAL.bm25 },
              ].map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{pct(r.d.r5)}</td>
                  <td>{pct(r.d.r10)}</td>
                  <td>{pct(r.d.r20)}</td>
                  <td>{pct(r.d.ndcg10)}</td>
                  <td>{pct(r.d.mrr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Adding local vectors to BM25 lifts R@5 from {pct(LONGMEMEVAL.bm25.r5)} to {pct(LONGMEMEVAL.hybrid.r5)}.{" "}
          <Src href={src.longmemeval}>benchmark/LONGMEMEVAL.md</Src>
        </p>

        <h3>By question type, BM25 + vectors</h3>
        <div className={s.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Questions</th>
                <th>R@5</th>
                <th>R@10</th>
                <th>Found at top 5</th>
              </tr>
            </thead>
            <tbody>
              {LONGMEMEVAL.byType.map((t) => (
                <tr key={t.type}>
                  <td>{t.type}</td>
                  <td>{t.count}</td>
                  <td>{pct(t.r5)}</td>
                  <td>{pct(t.r10)}</td>
                  <td>
                    {TYPE_HITS.find((h) => h.type === t.type)?.hits[5]} of {t.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Preferences are the hardest type: they depend on implicit statements, and R@5 is {pct(LONGMEMEVAL.byType[5].r5)}.
          Knowledge updates and multi-session questions are the strongest.
        </p>

        <h2>Token cost per query</h2>
        <p>
          A smaller labeled set of coding-session observations: {TOKEN_SETUP.observations} observations across{" "}
          {TOKEN_SETUP.sessions} sessions and {TOKEN_SETUP.queries} queries, with {TOKEN_SETUP.model}. The baseline loads
          every observation into the prompt.
        </p>
        <div className={s.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Mode</th>
                <th>R@5</th>
                <th>R@10</th>
                <th>P@5</th>
                <th>NDCG@10</th>
                <th>MRR</th>
                <th>Tokens</th>
              </tr>
            </thead>
            <tbody>
              {TOKEN_ROWS.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{pct(r.r5)}</td>
                  <td>{pct(r.r10)}</td>
                  <td>{pct(r.p5)}</td>
                  <td>{pct(r.ndcg)}</td>
                  <td>{pct(r.mrr)}</td>
                  <td>{r.tokens.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          {TOKENS.agentmemory.toLocaleString("en-US")} tokens instead of {TOKENS.fullContext.toLocaleString("en-US")} is{" "}
          {TOKENS.savedPct}% fewer, with higher precision, measured on v0.6.0.{" "}
          <Src href={src.tokens}>benchmark/REAL-EMBEDDINGS.md</Src>
        </p>

        <h2>Crash recovery</h2>
        <p>
          The cost bench runs the built package in an isolated home, captures N observations, kills the whole process
          tree with SIGKILL, boots it again and checks that nothing was lost.
        </p>
        <ul className={s.facts}>
          {RECOVERY_FACTS.map((f) => (
            <li key={f.value}>
              <strong>{f.value}</strong> {f.label}
            </li>
          ))}
        </ul>
        <p>
          <Src href={benchSrc.costsFigure}>docs/benchmarks/capture-costs.svg</Src>{" "}
          <Src href={benchSrc.readme}>benchmark/README.md</Src>
        </p>

        <h2>Resource budgets</h2>
        <p>
          The cost bench checks each run against these ceilings. They were derived from repeated runs, taking the worst run plus
          headroom, so they are upper limits rather than typical values, and they depend on the machine that runs them.
          The embed profile uses 768-dimension vectors.
        </p>
        <div className={s.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Profile</th>
                <th>Observations</th>
                <th>Hook p95</th>
                <th>Index ready after kill</th>
                <th>Disk per observation</th>
                <th>Idle memory</th>
                <th>Search tokens p50</th>
              </tr>
            </thead>
            <tbody>
              {BUDGETS.map((b) => (
                <tr key={`${b.profile}-${b.n}`}>
                  <td>{b.profile}</td>
                  <td>{b.n.toLocaleString("en-US")}</td>
                  <td>{b.hookP95Ms} ms</td>
                  <td>{sec(b.recoveryIndexReadyMs)}</td>
                  <td>{kib(b.diskPerObsBytes)}</td>
                  <td>{mib(b.idleRssKiB)}</td>
                  <td>{b.searchTokensP50}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          <Src href={benchSrc.budgets}>benchmark/capture-costs-budgets.json</Src>
        </p>

        <h2>Reproduce</h2>
        <p>Retrieval, from the repository root, after downloading the dataset:</p>
        <pre>
          <code>{`${REPRODUCE.download}\n\n${REPRODUCE.bm25}\n${REPRODUCE.hybrid}`}</code>
        </pre>
        <p>Costs and crash recovery, against the built package:</p>
        <pre>
          <code>{REPRODUCE.costs}</code>
        </pre>
        <p>
          Scripts: <Src href={benchSrc.longmemevalScript}>benchmark/longmemeval-bench.ts</Src>{" "}
          <Src href={benchSrc.realEmbeddingsScript}>benchmark/real-embeddings-eval.ts</Src>
        </p>
      </Prose>
    </DocPage>
  );
}
