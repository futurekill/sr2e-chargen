/**
 * The Shadowland board (docs/PLAN-help-footer.md 3; PLAN.md U11 as amended 2026-11-27): which thread of in-character
 * banter the footer shows. Pure: the data and the random source are passed in, so tests are deterministic.
 * Data: banter/*.json, schema "sr2e-banter" version 2 — `entries: { "<key>": [ thread, … ] }`, a thread = 2–4 lines
 * `{ handle, text, stamp }`. All "original" writing in the project's own handles (U12: no book quotes).
 */

export const SCHEMA = "sr2e-banter", VERSION = 2;
const KEY = /^(page|step|metatype|choice|itemtype):[a-z0-9._-]+$/i;
const STAMP = /^\d\d:\d\d:\d\d\/\d\d-\d\d-\d\d$/;

/** Problems with one banter file, or [] (the tests run this over every file). */
export function banterProblems(file, name = "banter") {
  const out = [];
  if (file?.schema !== SCHEMA || file.version !== VERSION) return [`${name}: not ${SCHEMA} version ${VERSION}`];
  if (file.set !== "original" || file.source !== "original") out.push(`${name}: only the original set is shipped (U12)`);
  for (const [k, threads] of Object.entries(file.entries ?? {})) {
    if (!KEY.test(k)) out.push(`${name}: bad key ${k}`);
    if (!Array.isArray(threads) || !threads.length) { out.push(`${name}: ${k} has no threads`); continue; }
    threads.forEach((t, i) => {
      if (!Array.isArray(t) || t.length < 2 || t.length > 4) out.push(`${name}: ${k} thread ${i} must have 2–4 lines`);
      for (const l of t ?? []) {
        if (typeof l?.handle !== "string" || !/^[A-Za-z0-9 .'-]{2,24}$/.test(l.handle)) out.push(`${name}: ${k} thread ${i}: a bad handle`);
        if (typeof l?.text !== "string" || !l.text.trim() || l.text.length > 280) out.push(`${name}: ${k} thread ${i}: text must be 1–280 characters`);
        if (typeof l?.stamp !== "string" || !STAMP.test(l.stamp)) out.push(`${name}: ${k} thread ${i}: a bad stamp`);
      }
    });
  }
  return out;
}

/** All files merged into one key → threads map. */
export function mergeBanter(files) {
  const out = {};
  for (const f of files) for (const [k, ts] of Object.entries(f.entries)) (out[k] ??= []).push(...ts);
  return out;
}

/**
 * The keys that fit where the user is, most specific first; `page:any` always last.
 * `board`: { page, step, race, choices: [ "priority.magic.A", "essence.low", … ] } — set by the page itself.
 */
export function contextKeys(board = {}) {
  const keys = [];
  for (const c of board.choices ?? []) keys.push(`choice:${c}`);
  if (board.step) keys.push(`step:${board.step}`);
  if (board.race) keys.push(`metatype:${board.race}`);
  if (board.page) keys.push(`page:${board.page}`);
  keys.push("page:any");
  return [...new Set(keys)];
}

/**
 * One thread for these keys. Walk the keys in order: a key that has threads is taken with probability `stick` (so a
 * page doesn't always show its most specific line), else the walk goes on; `page:any` is the last resort.
 * `avoid`: a thread id ("key#index") to skip when another exists (two loads in a row differ; r2 #3).
 * Returns { id, lines } or null.
 */
export function pickThread(data, keys, rng = Math.random, { avoid = null, stick = 0.6 } = {}) {
  const fresh = (k) => data[k].map((_, i) => `${k}#${i}`).filter(id => id !== avoid);
  // A key counts only if it has a thread other than the last one shown — unless no key has (code review r1 #2).
  const usable = keys.filter(k => data[k]?.length && fresh(k).length);
  const pool = usable.length ? usable : keys.filter(k => data[k]?.length);
  if (!pool.length) return null;
  let key = pool.at(-1);
  for (const k of pool) if (rng() < stick) { key = k; break; }
  const options = usable.length ? fresh(key) : data[key].map((_, i) => `${key}#${i}`);
  const id = options[Math.floor(rng() * options.length) % options.length];
  return { id, lines: data[key][Number(id.split("#")[1])] };
}

/** The choices on a character the board can comment on (choice:* keys), from its document body. */
export function characterChoices(body, essence = null) {
  const out = [], sys = body?.actor?.system ?? {}, pr = sys.chargen?.priorities ?? {};
  for (const [cat, letter] of Object.entries(pr)) if (/^[A-E]$/.test(String(letter))) out.push(`priority.${cat}.${letter}`);
  const ess = Number(essence ?? sys.essence?.value ?? sys.essence);
  if (Number.isFinite(ess) && ess < 2) out.push("essence.low");
  const ware = (body?.actor?.items ?? []).some(i => i.type === "cyberware");
  if (sys.magic?.type && sys.magic.type !== "none" && ware) out.push("magic.with.cyberware");
  return out;
}
