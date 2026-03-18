const step2map: Record<string, string> = {
  ational: "ate", tional: "tion", enci: "ence", anci: "ance",
  izer: "ize", iser: "ise", abli: "able", alli: "al",
  entli: "ent", eli: "e", ousli: "ous", ization: "ize",
  isation: "ise", ation: "ate", ator: "ate", alism: "al",
  iveness: "ive", fulness: "ful", ousness: "ous", aliti: "al",
  iviti: "ive", biliti: "ble",
};

const step3map: Record<string, string> = {
  icate: "ic", ative: "", alize: "al", alise: "al",
  iciti: "ic", ical: "ic", ful: "", ness: "",
};

function hasVowel(s: string): boolean {
  return /[aeiou]/.test(s);
}

function measure(s: string): number {
  const reduced = s.replace(/[^aeiouy]+/g, "C").replace(/[aeiouy]+/g, "V");
  const m = reduced.match(/VC/g);
  return m ? m.length : 0;
}

function endsDoubleConsonant(s: string): boolean {
  return s.length >= 2 && s[s.length - 1] === s[s.length - 2] && !/[aeiou]/.test(s[s.length - 1]);
}

function endsCVC(s: string): boolean {
  if (s.length < 3) return false;
  const c1 = s[s.length - 3], v = s[s.length - 2], c2 = s[s.length - 1];
  return !/[aeiou]/.test(c1) && /[aeiou]/.test(v) && !/[aeiouwxy]/.test(c2);
}

export function stem(word: string): string {
  if (word.length <= 2) return word;

  let w = word;

  if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("ies")) w = w.slice(0, -2);
  else if (!w.endsWith("ss") && w.endsWith("s")) w = w.slice(0, -1);

  if (w.endsWith("eed")) {
    if (measure(w.slice(0, -3)) > 0) w = w.slice(0, -1);
  } else if (w.endsWith("ed") && hasVowel(w.slice(0, -2))) {
    w = w.slice(0, -2);
    if (w.endsWith("at") || w.endsWith("bl") || w.endsWith("iz")) w += "e";
    else if (endsDoubleConsonant(w) && !/[lsz]$/.test(w)) w = w.slice(0, -1);
    else if (measure(w) === 1 && endsCVC(w)) w += "e";
  } else if (w.endsWith("ing") && hasVowel(w.slice(0, -3))) {
    w = w.slice(0, -3);
    if (w.endsWith("at") || w.endsWith("bl") || w.endsWith("iz")) w += "e";
    else if (endsDoubleConsonant(w) && !/[lsz]$/.test(w)) w = w.slice(0, -1);
    else if (measure(w) === 1 && endsCVC(w)) w += "e";
  }

  if (w.endsWith("y") && hasVowel(w.slice(0, -1))) {
    w = w.slice(0, -1) + "i";
  }

  for (const [suffix, replacement] of Object.entries(step2map)) {
    if (w.endsWith(suffix)) {
      const base = w.slice(0, -suffix.length);
      if (measure(base) > 0) w = base + replacement;
      break;
    }
  }

  for (const [suffix, replacement] of Object.entries(step3map)) {
    if (w.endsWith(suffix)) {
      const base = w.slice(0, -suffix.length);
      if (measure(base) > 0) w = base + replacement;
      break;
    }
  }

  if (w.endsWith("al") || w.endsWith("ance") || w.endsWith("ence") ||
      w.endsWith("er") || w.endsWith("ic") || w.endsWith("able") ||
      w.endsWith("ible") || w.endsWith("ant") || w.endsWith("ement") ||
      w.endsWith("ment") || w.endsWith("ent") || w.endsWith("tion") ||
      w.endsWith("sion") || w.endsWith("ou") || w.endsWith("ism") ||
      w.endsWith("ate") || w.endsWith("iti") || w.endsWith("ous") ||
      w.endsWith("ive") || w.endsWith("ize") || w.endsWith("ise")) {
    const suffixLen = w.match(/(ement|ment|tion|sion|ance|ence|able|ible|ism|ate|iti|ous|ive|ize|ise|ant|ent|al|er|ic|ou)$/)?.[0]?.length ?? 0;
    if (suffixLen > 0) {
      const base = w.slice(0, -suffixLen);
      if (measure(base) > 1) w = base;
    }
  }

  if (w.endsWith("e")) {
    const base = w.slice(0, -1);
    if (measure(base) > 1 || (measure(base) === 1 && !endsCVC(base))) {
      w = base;
    }
  }

  if (endsDoubleConsonant(w) && w.endsWith("l") && measure(w.slice(0, -1)) > 1) {
    w = w.slice(0, -1);
  }

  return w;
}
