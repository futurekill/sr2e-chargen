/** M7 (docs/PLAN-M7.md): the Foundry connector — Foundry's own actor JSON, both ways. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { buildCatalog } from "../tools/build-catalog.mjs";
import { newCharacter, applyOp } from "../shared/creation.mjs";
import { toFoundryActor, fromFoundryActor } from "../shared/foundry.mjs";

const root = new URL("../", import.meta.url);
const catalog = buildCatalog({ pins: JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir: new URL("content", root).pathname });
const byId = new Map(catalog.entries.map(e => [e.id, e])), lookup = (id) => byId.get(id) ?? null;
const core = (name, type) => catalog.entries.find(x => x.book === "sr2" && x.name === name && x.type === type).id;
const V = "0.161.0";
function finished() {
  let b = newCharacter("Exported");
  b = [{ op: "addItem", catalogId: core("Ares Predator", "weapon") }, { op: "addSkill", catalogId: core("Firearms", "skill") }].reduce((x, o) => applyOp(x, o, lookup), b);
  b.creation.finished = { at: 1, leftover: 0, roll: 10, nuyen: 5000, karmaPool: 1 };
  b.actor.system.chargen.inProgress = false;
  b.actor.system.nuyen = 5000;
  return b;
}

test("export: Foundry's actor shape, the pinned version, items with their ids and sources, no img; the round trip keeps system and items", () => {
  const b = finished(), f = toFoundryActor(b, V);
  assert.deepEqual([f.type, f._stats.systemId, f._stats.systemVersion, f.img, f.prototypeToken.actorLink], ["character", "sr2e", V, undefined, true]);
  assert.deepEqual(f.items.map(i => i._id), b.actor.items.map(i => i._id));
  assert.ok(f.items.every(i => i._stats.compendiumSource));
  const back = fromFoundryActor(JSON.parse(JSON.stringify(f)), { pinnedVersion: V, now: 9 });
  assert.deepEqual(back.actor.system, b.actor.system);
  assert.deepEqual(back.actor.items.map(i => [i._id, i.name, i.type]), b.actor.items.map(i => [i._id, i.name, i.type]));
  assert.deepEqual(back.creation.finished, { at: 9, imported: { from: "foundry", systemVersion: V } });
  assert.equal(toFoundryActor(back, "0.170.0")._stats.systemVersion, V, "an imported character keeps its own version stamp");
});

test("import refusals: type, system, version (missing, newer), in creation, numbers, ids, prototype keys", () => {
  const f = () => JSON.parse(JSON.stringify(toFoundryActor(finished(), V)));
  const no = (mut, re) => { const j = f(); mut(j); assert.throws(() => fromFoundryActor(j, { pinnedVersion: V }), re); };
  no(j => { j.type = "npc"; }, /Only a character/);
  no(j => { j._stats.systemId = "dnd5e"; }, /isn't from the Shadowrun/);
  no(j => { delete j._stats.systemVersion; }, /which system version/);
  no(j => { j._stats.systemVersion = "0.999.0"; }, /newer than this app knows/);
  no(j => { j.system.chargen.inProgress = true; }, /still in creation/);
  no(j => { delete j.system.chargen.inProgress; }, /still in creation/);
  no(j => { j.system.nuyen = 1e308; }, /nuyen/);
  no(j => { j.system.karma = { total: -3 }; }, /Karma \(total\)/);
  no(j => { j.items[1]._id = j.items[0]._id; }, /unique Foundry id/);
  no(j => { j.system.karma = "lots"; }, /Karma isn't readable/);   // code review r1 #1
  no(j => { j.system.conditionMonitor = { physical: { value: "1", max: 10 } }; }, /physical condition monitor/);   // r1 #2
  no(j => { j.system.race = 7; }, /metatype/);   // r1 #3
  no(j => { j.system.magic = { type: 3 }; }, /magic type/);
  no(j => { j.items.find(i => i.type === "skill").system.rating = "5"; }, /rating isn't a whole number/);   // r1 #5
  no(j => { j.items[0].system.essenceCost = "0.5"; }, /Essence isn't a number/);
  no(j => { j.system.notes = JSON.parse('{"__proto__": {"x": 1}}'); }, /won't read/);
  const skill = f(); delete skill.items.find(i => i.type === "skill").system.concentration;
  assert.deepEqual(fromFoundryActor(skill, { pinnedVersion: V }).actor.items.find(i => i.type === "skill").system.concentration, { name: "", rating: 0 });
});

test("server: import makes a finished character in the library; the export route is owner-only; play ops work on it", async () => {
  const { testContext, PW } = await import("./helpers.mjs");
  const { buildApp } = await import("../server/app.mjs");
  const { loadConfig } = await import("../server/config.mjs");
  const A = await import("../server/auth/accounts.mjs");
  const t = await testContext(), ORIGIN = "https://hoi.example";
  const app = await buildApp({ ctx: t.ctx, config: loadConfig({ NODE_ENV: "production", BASE_URL: ORIGIN }), logger: false, catalog: { byId, manifest: { books: catalog.books, pins: [{ id: "sr2e", version: V }] } } });
  const person = async (username, secret) => {
    const res = await app.inject({ method: "POST", url: "/api/redeem", headers: { origin: ORIGIN }, payload: { secret, username, password: PW } });
    const cookie = res.headers["set-cookie"].split(";")[0], csrf = (await app.inject({ url: "/api/session", headers: { cookie } })).json().csrf;
    return (method, url, body) => app.inject({ method, url, headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, ...(method === "GET" ? {} : { "idempotency-key": randomUUID() }) }, ...(body ? { payload: body } : {}) });
  };
  const me = await person("Boss", (await A.bootstrap(t.ctx)).secret), other = await person("Razor", (await A.createInvite(t.ctx)).secret);
  const res = (await me("POST", "/api/documents/characters/import", toFoundryActor(finished(), V))).json();
  assert.equal(res.document.kind, "character");
  const id = res.document.id;
  assert.equal((await me("GET", `/api/documents/${id}/foundry`)).json()._stats.systemVersion, V);
  assert.equal((await other("GET", `/api/documents/${id}/foundry`)).statusCode, 404);
  const award = (await me("POST", `/api/documents/${id}/ops`, { revision: 1, ops: [{ op: "awardKarma", amount: 10, note: "run" }] })).json();
  assert.equal(award.body.actor.system.karma.total, 10);
  assert.equal((await me("POST", "/api/documents/characters/import", { type: "npc" })).json().code, "refused");
  const broken = toFoundryActor(finished(), V);   // r1 #4: a rules error refuses the import
  broken.items.push({ _id: "zz00000000000001", name: "Junk Ware", type: "cyberware", system: { essenceCost: 7, installed: true }, flags: {}, effects: [] });
  const r = (await me("POST", "/api/documents/characters/import", broken)).json();
  assert.equal(r.code, "refused"); assert.match(r.message ?? r.error ?? "", /breaks the rules/);
  await app.close();
});

test("a real Foundry 'Export Data' file (system 0.161.0, every schema default filled) imports, derives and validates", async () => {
  const { derive } = await import("../shared/derive.mjs");
  const { validate } = await import("../shared/creation.mjs");
  const json = JSON.parse(readFileSync(new URL("fixtures/foundry-export-0.161.0.json", import.meta.url), "utf8"));
  const b = fromFoundryActor(json, { pinnedVersion: V, now: 1 });
  assert.equal(b.actor.items.length, 6);
  assert.equal(b.actor.system.nuyen, 4321);
  const d = derive({ actor: b.actor });
  assert.deepEqual([d.essence, d.armor.ballistic, d.attributes.body], [5.8, 5, 5]);
  assert.equal(validate(b).problems.filter(p => p.severity === "error").length, 0);
});
