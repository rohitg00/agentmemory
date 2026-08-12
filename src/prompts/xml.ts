const VALID_TAG = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

// Neutralises XML/markup metacharacters so stored memory content cannot
// break out of the wrapping tags it gets embedded in. Without this, a
// memory whose text contains `</agentmemory-context><system>…` could
// escape the context wrapper and inject instructions into the agent's
// prompt (the H1 injection vector). Escaping `<` and `>` defangs both the
// closing-tag breakout and any injected pseudo-tags; `&` keeps the
// escaping itself unambiguous; `"`/`'` make it safe in attribute position
// too. Used by every site that interpolates untrusted text into a tagged
// block (context.ts, slots.ts, enrich.ts).
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function getXmlTag(xml: string, tag: string): string {
  if (!VALID_TAG.test(tag)) return "";
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1].trim() : "";
}

export function getXmlChildren(
  xml: string,
  parentTag: string,
  childTag: string,
): string[] {
  if (!VALID_TAG.test(parentTag) || !VALID_TAG.test(childTag)) return [];
  const parentMatch = xml.match(
    new RegExp(`<${parentTag}>([\\s\\S]*?)</${parentTag}>`),
  );
  if (!parentMatch) return [];
  const items: string[] = [];
  const re = new RegExp(`<${childTag}>([\\s\\S]*?)</${childTag}>`, "g");
  let m;
  while ((m = re.exec(parentMatch[1])) !== null) {
    items.push(m[1].trim());
  }
  return items;
}
