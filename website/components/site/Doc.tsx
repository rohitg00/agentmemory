import type { ReactNode } from "react";
import { Nav } from "./Nav";
import { Footer } from "./Footer";
import s from "./Doc.module.css";

export function DocPage({
  eyebrow,
  title,
  lede,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <>
      <Nav />
      <main className={s.main}>
        <header className="wrap">
          <div className={s.head}>
            <span className="eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
            {lede && <p className={s.lede}>{lede}</p>}
            {updated && <p className={`mono ${s.updated}`}>{updated}</p>}
          </div>
        </header>
        <div className="wrap">
          <div className={s.body}>{children}</div>
        </div>
      </main>
      <Footer />
    </>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className={s.prose}>{children}</div>;
}
