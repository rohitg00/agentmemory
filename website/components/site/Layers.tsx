import { DitherFigure } from "./DitherFigure";
import type { DitherShape } from "./DitherFigure";
import s from "./Layers.module.css";

const LAYERS: { n: string; shape: DitherShape; title: string; body: string; tag: string }[] = [
  {
    n: "01",
    shape: "stack",
    title: "Observations",
    body: "Every prompt and tool call, with a bounded copy of the output. Written to disk as it happens.",
    tag: "always on",
  },
  {
    n: "02",
    shape: "block",
    title: "Memories and lessons",
    body: "Related observations collapse into one memory that keeps links back to its sources.",
    tag: "with a model provider",
  },
  {
    n: "03",
    shape: "graph",
    title: "Knowledge graph",
    body: "Entities and the links between them, for questions that span many sessions.",
    tag: "optional",
  },
];

export function Layers() {
  return (
    <section className={s.band} aria-labelledby="layers-title">
      <div className="wrap">
        <div className={s.head}>
          <span className={`mono ${s.eyebrow}`}>What it keeps</span>
          <h2 id="layers-title">Raw history at the bottom. Meaning on top.</h2>
        </div>
        <ol className={s.grid}>
          {LAYERS.map((layer) => (
            <li key={layer.n} className={s.cell}>
              <DitherFigure shape={layer.shape} className={s.figure} />
              <div className={s.text}>
                <span className={`mono ${s.num}`}>{layer.n}</span>
                <h3>{layer.title}</h3>
                <p>{layer.body}</p>
                <span className={`mono ${s.tag}`}>{layer.tag}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
