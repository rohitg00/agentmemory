const VALID_TAG = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

export function getXmlTag(xml: string, tag: string): string {
  if (!VALID_TAG.test(tag)) return "";
  return getXmlTagBody(xml, tag)?.trim() ?? "";
}

export function getXmlChildren(
  xml: string,
  parentTag: string,
  childTag: string,
): string[] {
  if (!VALID_TAG.test(parentTag) || !VALID_TAG.test(childTag)) return [];
  const parentBody = getXmlTagBody(xml, parentTag);
  if (parentBody === null) return [];
  const items: string[] = [];
  const open = `<${childTag}>`;
  const close = `</${childTag}>`;
  let from = 0;
  while (from < parentBody.length) {
    const start = parentBody.indexOf(open, from);
    if (start === -1) break;
    const contentStart = start + open.length;
    const end = parentBody.indexOf(close, contentStart);
    if (end === -1) break;
    items.push(parentBody.slice(contentStart, end).trim());
    from = end + close.length;
  }
  return items;
}

function getXmlTagBody(xml: string, tag: string): string | null {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = xml.indexOf(open);
  if (start === -1) return null;
  const contentStart = start + open.length;
  const end = xml.indexOf(close, contentStart);
  if (end === -1) return null;
  return xml.slice(contentStart, end);
}
