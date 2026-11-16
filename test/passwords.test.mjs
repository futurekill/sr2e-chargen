import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, parsePhc, encodePhc, passwordProblem, dummyHash, PARAMS, Busy, _queue } from "../server/auth/passwords.mjs";

const FAST = { ...PARAMS, memory: 8192, passes: 1 };   // the smallest verify() accepts: keeps the suite quick

test("hash and verify round trip; a wrong password fails", async () => {
  const phc = await hashPassword("correct horse battery");
  assert.match(phc, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/);
  assert.deepEqual(await verifyPassword("correct horse battery", phc), { ok: true, rehash: false });
  assert.deepEqual(await verifyPassword("correct horse batterz", phc), { ok: false, rehash: false });
  assert.notEqual(phc, await hashPassword("correct horse battery"));   // a fresh salt each time
});

test("older parameters verify and ask for a rehash", async () => {
  const phc = await hashPassword("an old password!", FAST);
  assert.deepEqual(await verifyPassword("an old password!", phc), { ok: true, rehash: true });
  assert.deepEqual(await verifyPassword("nope nope nope", phc), { ok: false, rehash: false });
});

test("the PHC parser is strict", () => {
  const salt = Buffer.alloc(16, 1), tag = Buffer.alloc(32, 2);
  const good = encodePhc(PARAMS, salt, tag);
  const p = parsePhc(good);
  assert.equal(p.memory, 65536); assert.ok(p.salt.equals(salt)); assert.ok(p.tag.equals(tag));
  for (const bad of ["", null, "plaintext", good.replace("argon2id", "argon2i"), good.replace("v=19", "v=16"),
    good.replace("m=65536", "m=1"), good.replace("m=65536", "m=99999999"), good.replace("t=3", "t=99"), good.replace("p=1", "p=9"),
    good + "=", good.replace(/\$[^$]+$/, "$!!!!"), good.replace("m=65536,t=3,p=1", "m=65536,p=1,t=3"), `${good}$extra`]) {
    assert.equal(parsePhc(bad), null, String(bad));
  }
});

test("a malformed stored hash never verifies", async () => {
  assert.deepEqual(await verifyPassword("anything at all", "not-a-hash"), { ok: false, rehash: false });
});

test("the dummy hash is a real hash, made once", async () => {
  const a = await dummyHash(), b = await dummyHash();
  assert.equal(a, b);
  assert.ok(parsePhc(a));
});

test("the queue runs 2 at a time, holds 16, and refuses the rest", async () => {
  const jobs = Array.from({ length: 2 + 16 }, (_, i) => hashPassword(`password number ${i}`, FAST));
  assert.equal(_queue.running, 2);
  assert.equal(_queue.waiting.length, 16);
  await assert.rejects(hashPassword("one too many!!", FAST), Busy);
  await Promise.all(jobs);
  assert.equal(_queue.running, 0);
  assert.equal(_queue.waiting.length, 0);
});

test("password rules: length and not the handle", () => {
  assert.match(passwordProblem("short"), /12/);
  assert.match(passwordProblem("x".repeat(257)), /256/);
  assert.match(passwordProblem("my-Razor-password", "razor"), /handle/);
  assert.equal(passwordProblem("a perfectly fine one", "razor"), null);
});
