const VALID_TAG = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

export function escapeXmlText(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeXml(s: string): string {
  return escapeXmlText(s).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
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
