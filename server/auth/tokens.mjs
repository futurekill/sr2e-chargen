/** Random bearer secrets (docs/PLAN-M3.md §4): 32 random bytes shown once; only the SHA-256 is ever stored. */
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

export const sha256 = (s) => createHash("sha256").update(String(s)).digest("hex");
export function newSecret() {
  const secret = randomBytes(32).toString("base64url");
  return { secret, hash: sha256(secret) };
}
export const looksLikeSecret = (s) => typeof s === "string" && /^[A-Za-z0-9_-]{43}$/.test(s);
export function sameHash(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
