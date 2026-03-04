import { timingSafeEqual, createHmac, randomBytes } from "node:crypto";

const hmacKey = randomBytes(32);

export function timingSafeCompare(a: string, b: string): boolean {
  const hmacA = createHmac("sha256", hmacKey).update(a).digest();
  const hmacB = createHmac("sha256", hmacKey).update(b).digest();
  return timingSafeEqual(hmacA, hmacB);
}

export const VIEWER_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' ws://localhost:* wss://localhost:*; img-src 'self'; font-src 'self'";
