interface XmlElement {
  name: string;
  content: string;
}

function elements(xml: string): XmlElement[] | null {
  const result: XmlElement[] = [];
  let remaining = xml.trim();
  while (remaining) {
    const match = /^<([a-z][a-z0-9_-]*)\s*(?:\/>|>([\s\S]*?)<\/\1\s*>)/.exec(remaining);
    if (!match) return null;
    result.push({ name: match[1], content: match[2] ?? "" });
    remaining = remaining.slice(match[0].length).trim();
  }
  return result;
}

function xmlText(content: string): string | null {
  if (content.includes("<") || /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(content)) {
    return null;
  }
  const entities: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  };
  let valid = true;
  const text = content.replace(/&([^;]+);/g, (_, entity: string) => {
    if (entity in entities) return entities[entity];
    const code = entity.startsWith("#x")
      ? parseInt(entity.slice(2), 16)
      : Number(entity.slice(1));
    if (!(code === 9 || code === 10 || code === 13 ||
      (code >= 0x20 && code <= 0xd7ff) ||
      (code >= 0xe000 && code <= 0xfffd) ||
      (code >= 0x10000 && code <= 0x10ffff))) {
      valid = false;
      return "";
    }
    return String.fromCodePoint(code);
  });
  return valid && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text) ? text.trim() : null;
}

const SCALARS = new Set(["type", "title", "subtitle", "narrative", "importance"]);
const LISTS: Record<string, string> = { facts: "fact", concepts: "concept", files: "file" };

export function parseCompressionXml(response: string) {
  let xml = response.trim();
  // Reasoning is outside the observation contract, even when it quotes XML fields.
  xml = xml.replace(/^<(think|thought)>[\s\S]*?<\/\1>\s*/, "");
  const fenced = /^```(?:xml)?\s*\n([\s\S]*?)\n```$/i.exec(xml);
  if (fenced) xml = fenced[1].trim();

  const roots = elements(xml);
  if (!roots || roots.length !== 1 || roots[0].name !== "observation") return null;
  const fields = elements(roots[0].content);
  if (!fields) return null;
  const seen = new Set<string>();
  const scalars: Record<string, string> = {};
  const lists: Record<string, string[]> = { facts: [], concepts: [], files: [] };
  for (const field of fields) {
    if (seen.has(field.name)) return null;
    seen.add(field.name);
    if (SCALARS.has(field.name)) {
      const text = xmlText(field.content);
      if (text === null) return null;
      scalars[field.name] = text;
    } else if (Object.hasOwn(LISTS, field.name)) {
      const children = elements(field.content);
      if (!children) return null;
      for (const child of children) {
        if (child.name !== LISTS[field.name]) return null;
        const text = xmlText(child.content);
        if (text === null || !text) return null;
        lists[field.name].push(text);
      }
    } else {
      return null;
    }
  }
  return {
    type: scalars.type ?? "",
    title: scalars.title ?? "",
    subtitle: scalars.subtitle || undefined,
    facts: lists.facts,
    narrative: scalars.narrative ?? "",
    concepts: lists.concepts,
    files: lists.files,
    importance: /^\d+$/.test(scalars.importance ?? "") ? Number(scalars.importance) : NaN,
  };
}
