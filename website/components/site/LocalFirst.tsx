import { DISK_WRITES, MACHINE_EXTRAS, MACHINE_NODES, PROVIDERS, TELEMETRY_LINE } from "@/lib/trust";
import { Reveal } from "./client";
import s from "./LocalFirst.module.css";

export function LocalFirst() {
  return (
    <section id="local" className="section" aria-labelledby="local-title">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Local-first</span>
          <h2 id="local-title">Everything runs inside your machine.</h2>
          <p>
            Capture, storage, search and the viewer all bind to 127.0.0.1. Nothing crosses the boundary unless you add a
            provider yourself.
          </p>
        </div>

        <Reveal className={s.figure}>
          <div className={s.boundary}>
            <div className={s.boundaryHead}>
              <span className="mono">your machine</span>
              <span className="mono">127.0.0.1</span>
            </div>

            <div className={s.flow}>
              <div className={s.rail} aria-hidden="true">
                <span className={s.railLine} />
                {[0, 1, 2].map((i) => (
                  <span key={i} className={s.carrier} style={{ ["--i" as string]: i }}>
                    <span className={s.packet} />
                  </span>
                ))}
              </div>
              <ol className={s.nodes}>
                {MACHINE_NODES.map((n, i) => (
                  <li key={n.name} className={s.node} style={{ ["--i" as string]: i }}>
                    <span className={s.port} aria-hidden="true" />
                    <span className={s.nodeName}>{n.name}</span>
                    <span className={`mono ${s.nodeSub}`}>{n.sub}</span>
                  </li>
                ))}
              </ol>
            </div>

            <ol className={s.writes} aria-label="Writes to disk">
              <li className={`mono ${s.writesHead}`}>writes · mem:obs</li>
              {DISK_WRITES.map((w, i) => (
                <li key={w.id} className={`mono ${s.write}`} style={{ ["--i" as string]: i }}>
                  <span className={s.writeId}>{w.id}</span>
                  <span>{w.what}</span>
                  <span className={s.writeOk}>written</span>
                </li>
              ))}
            </ol>

            <div className={s.extras}>
              {MACHINE_EXTRAS.map((x) => (
                <span key={x.name} className={`mono ${s.extra}`}>
                  <span className={s.extraName}>{x.name}</span>
                  {x.sub}
                </span>
              ))}
              <span className={`mono ${s.stored}`}>3 observations stored, 0 bytes sent</span>
            </div>
          </div>

          <div className={s.outside}>
            <span className={`mono ${s.outsideHead}`}>outside, optional, off by default</span>
            {PROVIDERS.map((p) => (
              <div key={p.name} className={s.provider}>
                <div className={s.providerHead}>
                  <span>{p.name}</span>
                  <span className={`mono ${s.off}`}>off</span>
                </div>
                <p>{p.sends}</p>
              </div>
            ))}
            <p className={`mono ${s.telemetry}`}>{TELEMETRY_LINE}</p>
          </div>
        </Reveal>

        <ul className={s.facts}>
          <li>
            <span className="mono">bind</span>
            REST, streams and viewer listen on 127.0.0.1 unless you change it.
          </li>
          <li>
            <span className="mono">auth</span>
            A random secret is generated on first start. Every bundled client reads it.
          </li>
          <li>
            <span className="mono">account</span>
            None. No sign-up, no hosted service, no analytics.
          </li>
        </ul>
        <p className={s.more}>
          <a className="src" href="/security">
            Read the security model
          </a>
        </p>
      </div>
    </section>
  );
}
