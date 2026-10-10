import type { ReactNode } from "react";

type Block =
  | { kind: "h"; level: number; text: string }
  | { kind: "p"; text: string }
  | { kind: "code"; text: string }
  | { kind: "list"; items: { text: string; children: string[] }[] };

function safeHref(href: string): string | null {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("#") || href.startsWith("/")) return href;
  return null;
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[([^\]]+)\]\(([^)\s]+)\))/g;

export function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}-${n++}`;
    if (m[1]) out.push(<code key={k}>{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{inline(m[2].slice(2, -2), k)}</strong>);
    else if (m[3]) {
      const href = safeHref(m[5]);
      const label = inline(m[4], k);
      out.push(
        href ? (
          <a key={k} href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
            {label}
          </a>
        ) : (
          <span key={k}>{label}</span>
        ),
      );
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function parse(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { text: string; children: string[] }[] | null = null;

  const flushPara = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: "list", items: list });
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      flushPara();
      flushList();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++]);
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    const h = line.match(/^(#{2,4})\s+(.*)$/);
    if (h) {
      flushPara();
      flushList();
      blocks.push({ kind: "h", level: h[1].length, text: h[2].trim() });
      continue;
    }
    const nested = line.match(/^\s{2,}[-*]\s+(.*)$/);
    if (nested && list && list.length) {
      list[list.length - 1].children.push(nested[1]);
      continue;
    }
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      flushPara();
      if (!list) list = [];
      list.push({ text: li[1], children: [] });
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    if (list && list.length && /^\s+\S/.test(line)) {
      list[list.length - 1].text += ` ${line.trim()}`;
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return blocks;
}

export function Markdown({ source, idPrefix = "md" }: { source: string; idPrefix?: string }) {
  return (
    <>
      {parse(source).map((b, i) => {
        const k = `${idPrefix}-${i}`;
        if (b.kind === "h") {
          const content = inline(b.text, k);
          return b.level <= 3 ? <h3 key={k}>{content}</h3> : <h4 key={k}>{content}</h4>;
        }
        if (b.kind === "code") {
          return (
            <pre key={k}>
              <code>{b.text}</code>
            </pre>
          );
        }
        if (b.kind === "list") {
          return (
            <ul key={k}>
              {b.items.map((it, j) => (
                <li key={`${k}-${j}`}>
                  {inline(it.text, `${k}-${j}`)}
                  {it.children.length > 0 && (
                    <ul>
                      {it.children.map((c, m) => (
                        <li key={`${k}-${j}-${m}`}>{inline(c, `${k}-${j}-${m}`)}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          );
        }
        return <p key={k}>{inline(b.text, k)}</p>;
      })}
    </>
  );
}
