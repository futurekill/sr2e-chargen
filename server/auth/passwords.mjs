/**
 * Passwords (docs/PLAN-M3.md §4): argon2id from node:crypto, stored as a PHC string with its parameters. node:crypto
 * returns the raw tag only, so the PHC encoding and its strict parser are here (round 1 #9). Every hash and verify
 * goes through ONE queue — 2 at a time, 16 waiting — so many addresses can't run 64 MiB hashes at once.
 */
import { argon2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const argon2Async = promisify(argon2);
export const PARAMS = Object.freeze({ memory: 65536, passes: 3, parallelism: 1, tagLength: 32, saltLength: 16 });
const LIMITS = { memory: [8192, 1048576], passes: [1, 10], parallelism: [1, 4] };   // what verify() will agree to run
const b64 = (buf) => buf.toString("base64").replace(/=+$/, "");

export class Busy extends Error { constructor() { super("busy"); this.statusCode = 503; } }

const queue = { running: 0, waiting: [], concurrency: 2, maxWaiting: 16 };
function slot() {
  if (queue.running < queue.concurrency) { queue.running++; return Promise.resolve(); }
  if (queue.waiting.length >= queue.maxWaiting) return Promise.reject(new Busy());
  return new Promise(resolve => queue.waiting.push(resolve));
}
function release() {
  const next = queue.waiting.shift();
  if (next) next(); else queue.running--;
}
async function derive(password, salt, { memory, passes, parallelism, tagLength }) {
  await slot();
  try { return await argon2Async("argon2id", { message: Buffer.from(String(password), "utf8"), nonce: salt, memory, passes, parallelism, tagLength }); }
  finally { release(); }
}

export function encodePhc({ memory, passes, parallelism }, salt, tag) {
  return `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${b64(salt)}$${b64(tag)}`;
}
/** Strict: argon2id v19, canonical unpadded base64, parameters inside LIMITS. Null for anything else. */
export function parsePhc(phc) {
  const m = /^\$argon2id\$v=19\$m=([1-9]\d{0,7}),t=([1-9]\d?),p=([1-9])\$([A-Za-z0-9+/]{11,86})\$([A-Za-z0-9+/]{22,86})$/.exec(String(phc ?? ""));
  if (!m) return null;
  const p = { memory: Number(m[1]), passes: Number(m[2]), parallelism: Number(m[3]) };
  for (const k of Object.keys(LIMITS)) if (p[k] < LIMITS[k][0] || p[k] > LIMITS[k][1]) return null;
  const salt = Buffer.from(m[4], "base64"), tag = Buffer.from(m[5], "base64");
  if (b64(salt) !== m[4] || b64(tag) !== m[5] || salt.length < 8 || tag.length < 16) return null;
  return { ...p, salt, tag };
}

export async function hashPassword(password, params = PARAMS) {
  const salt = randomBytes(params.saltLength);
  return encodePhc(params, salt, await derive(password, salt, params));
}
/** `{ ok, rehash }`: rehash when the stored parameters differ from today's (upgrade on the next login). */
export async function verifyPassword(password, phc) {
  const p = parsePhc(phc);
  if (!p) return { ok: false, rehash: false };
  const tag = await derive(password, p.salt, { ...p, tagLength: p.tag.length });
  const ok = tag.length === p.tag.length && timingSafeEqual(tag, p.tag);
  const current = p.memory === PARAMS.memory && p.passes === PARAMS.passes && p.parallelism === PARAMS.parallelism && p.tag.length === PARAMS.tagLength;
  return { ok, rehash: ok && !current };
}
/** A real hash of a random password: an unknown username verifies against it, so timing doesn't reveal accounts. */
let dummy;
export const dummyHash = () => (dummy ??= hashPassword(b64(randomBytes(24))));

/** Why a new password is refused, or null (PLAN-M3 §4: length 12–256, not the username; no composition rules). */
export function passwordProblem(password, username = "") {
  const p = String(password ?? "");
  if (p.length < 12) return "Too short, chummer: 12 characters at least.";
  if (p.length > 256) return "Too long: 256 characters at most.";
  if (username && p.toLowerCase().includes(String(username).toLowerCase())) return "Don't put your handle in your password.";
  return null;
}
export const _queue = queue;   // tests
