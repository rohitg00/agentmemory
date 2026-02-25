export function getXmlTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return match ? match[1].trim() : ''
}

export function getXmlChildren(xml: string, parentTag: string, childTag: string): string[] {
  const parentMatch = xml.match(new RegExp(`<${parentTag}>([\\s\\S]*?)</${parentTag}>`))
  if (!parentMatch) return []
  const items: string[] = []
  const re = new RegExp(`<${childTag}>([\\s\\S]*?)</${childTag}>`, 'g')
  let m
  while ((m = re.exec(parentMatch[1])) !== null) {
    items.push(m[1].trim())
  }
  return items
}
