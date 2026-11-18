import { createHash } from "node:crypto";

export function fingerprintId(prefix: string, content: string, length: 16 | 64 = 16): string {
  if (length !== 16 && length !== 64) throw new RangeError("Fingerprint length must be 16 or 64");
  const hash = createHash("sha256").update(content).digest("hex");
  return `${prefix}_${hash.slice(0, length)}`;
}
