/** The NPC builder (docs/PLAN-npc-builder.md; core p.187, p.68; RULINGS R22). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { buildCatalog, npcSources, vehicleSources, writeCatalog } from "../tools/build-catalog.mjs";
import { entryOf, loadCatalog } from "../server/catalog.mjs";
import { newNpc, applyNpcOp, npcView, npcActor, experiencePreview, NPC_OPS } from "../shared/npc.mjs";
import { testContext, PW } from "./helpers.mjs";
import { buildApp } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";
import * as A from "../server/auth/accounts.mjs";

const root = new URL("../", import.meta.url);
const pins = JSON.parse(readFileSync(new URL("content-pins.json", root), "utf8")).content, contentDir = new URL("content", root).pathname;
const built = buildCatalog({ pins, contentDir }), npcs = npcSources({ pins, contentDir });
const catalog = { byId: new Map(built.entries.map(e => [e.id, e])), vehicles: new Map(), npcs: new Map(Object.entries(npcs)), index: [], manifest: { books: built.books } };
const lookup = (id) => entryOf(catalog, id);
const idOf = (name) => Object.keys(npcs).find(k => npcs[k].source.name === name);
const make = (name) => newNpc(npcs[idOf(name)], null, idOf(name));
const op = (b, o) => applyNpcOp(b, { ...o }, lookup);
const refused = (fn, re) => assert.throws(fn, (e) => e.name === "Refusal" || e.constructor.name === "Refusal" ? (re ? re.test(e.message) : true) : false);

test("npcs.json: the 22 contacts and 7 archetypes; 15 printed Professional Rating ranges; no transfer effects in either pack", () => {
  const recs = Object.values(npcs);
  assert.equal(recs.filter(r => r.source.type === "npc").length, 22);
  assert.equal(recs.filter(r => r.source.type === "character").length, 7);
  assert.equal(recs.filter(r => r.prRange).length, 15);
  assert.deepEqual(npcs[idOf("Bounty Hunter")].prRange, [3, 4]);
  // archetypeSystem subtracts effect mods it would get again; today there are none to subtract (PLAN 2)
  assert.equal(recs.flatMap(r => (r.source.items ?? []).flatMap(i => (i.effects ?? []).filter(e => !e.disabled && e.transfer !== false))).length, 0);
});

test("npcs.json is written with its own checksum, loaded and checked; a wrong record is refused", () => {
  const dir = mkdtempSync(join(tmpdir(), "npc-cat-"));
  writeCatalog(built, dir, vehicleSources({ pins, contentDir }), null, npcs);
  const c = loadCatalog(dir);
  assert.equal(c.npcs.size, 29);
  const bad = mkdtempSync(join(tmpdir(), "npc-bad-")), wrong = structuredClone(npcs);
  wrong[idOf("Fixer")].source.name = "Not the Fixer";
  writeCatalog(built, bad, null, null, wrong);
  assert.throws(() => loadCatalog(bad), /npcs.json holds/);
});

test("a contact as printed: Threat 0, its items with fresh ids, the printed range kept", () => {
  const b = make("Bounty Hunter"), v = npcView(b);
  assert.equal(b.actor.system.threatRating, 0, "the contacts print none; Foundry's default is 1 (r2 #2)");
  assert.ok(b.actor.items.every(i => /^gn\d{14}$/.test(i._id)));
  assert.deepEqual([v.attributes.strength, v.reaction, v.initiativeDice, v.combatPool], [6, 8, 3, 6], "Strength 5 + 1 as printed");
  assert.deepEqual([v.prRange, v.professional.withdraw], [[3, 4], "serious"], "the low end until a rating is picked");
  assert.equal(npcView(op(b, { op: "setProfessionalRating", rating: 4 })).prRange, null, "picking one settles the range (code review r1 #2)");
  assert.equal(npcView(op(make("Fixer"), { op: "setProfessionalRating", rating: 1 })).prRange, null);
});

test("archetypes become NPCs with Foundry's prepared numbers baked in (the runners parity fixture)", () => {
  const fixture = JSON.parse(readFileSync(new URL("fixtures/parity/runners-v0.172.0.json", import.meta.url), "utf8"));
  for (const want of fixture.actors) {
    const id = Object.keys(npcs).find(k => k.endsWith(`.${want.id}`));
    const b = newNpc(npcs[id], null, id), v = npcView(b), at = (k) => `${want.name}: ${k}`;
    for (const [k, n] of Object.entries(want.attributes)) assert.equal(v.attributes[k], n, at(k));
    assert.equal(v.reaction, want.reaction, at("reaction"));
    assert.equal(v.initiativeDice, want.initiativeDice, at("initiative dice"));
    assert.equal(v.combatPool, want.pools.combat, at("combat pool"));
    assert.equal(v.astralPool, want.pools.astral, at("astral pool"));
    assert.deepEqual(v.armor, want.armor, at("armor"));
    assert.equal(b.actor.system.essence.value, want.essence, at("essence"));
    assert.equal(b.actor.system.magic.value, want.magic, at("magic"));
    assert.equal(b.actor.system.dicePools.magic.max, want.pools.magic, at("magic pool"));
    assert.equal(b.actor.system.professionalRating, 4, "p.187: any shadowrunner is Professional");
  }
  assert.match(make("Glitch (Decker)").notes, /Hacking Pool \d+/);
});

test("experience (p.187, R22): 25 years = +80%, stored values only, halves up, only the chosen targets", () => {
  let b = make("Bounty Hunter");
  const skill = b.actor.items.find(i => i.type === "skill");
  const before = { str: b.actor.system.strength.base, nuyen: b.actor.system.nuyen, cha: b.actor.system.charisma.base, sk: skill.system.rating };
  const p = experiencePreview(b, { years: 25, attributes: true });
  assert.equal(p.pct, 80);
  b = op(b, { op: "applyExperience", years: 25, attributes: true, skills: false, resources: false });
  assert.equal(b.actor.system.strength.base, 9, "5 × 1.8 = 9");
  assert.equal(b.actor.system.strength.mod, before.str === 5 ? 1 : b.actor.system.strength.mod, "the modifier stays");
  assert.equal(npcView(b).attributes.strength, 10, "9 + 1, never 11 (r5 #3)");
  assert.equal(b.actor.system.charisma.base, Math.floor(before.cha * 1.8 + 0.5));
  assert.equal(b.actor.items.find(i => i._id === skill._id).system.rating, before.sk, "skills not chosen");
  assert.equal(b.actor.system.nuyen, before.nuyen);
  assert.deepEqual(b.experience, [{ years: 25, pct: 80, targets: ["attributes"] }]);
  b = op(b, { op: "applyExperience", years: 3, attributes: false, skills: true, resources: true });
  assert.equal(b.actor.items.find(i => i._id === skill._id).system.rating, Math.floor(before.sk * 1.1 + 0.5));
  refused(() => op(b, { op: "applyExperience", years: 4, attributes: false, skills: false, resources: false }), /Choose what/);
  refused(() => op(b, { op: "applyExperience", years: 61, attributes: true, skills: false, resources: false }));
  const big = op(make("Troll Bouncer"), { op: "setAttribute", attr: "body", base: 60 });
  refused(() => op(big, { op: "applyExperience", years: 60, attributes: true, skills: false, resources: false }), /above this builder's limit/);
});

test("ops: bounds, items, custom skills, totem, Body Index fractions, equip, Threat and PR", () => {
  let b = newNpc(null, "Ganger");
  assert.deepEqual([b.actor.system.threatRating, b.actor.system.professionalRating, b.actor.system.body.base], [0, 1, 3]);
  b = op(b, { op: "setAttribute", attr: "body", base: 99 });
  refused(() => op(b, { op: "setAttribute", attr: "body", base: 100 }));
  refused(() => op(b, { op: "setAttribute", attr: "luck", base: 3 }));
  b = op(b, { op: "setProfessionalRating", rating: 4 });
  refused(() => op(b, { op: "setProfessionalRating", rating: 5 }));
  b = op(b, { op: "setThreatRating", rating: 3 });
  b = op(b, { op: "setBodyIndex", value: 1.25 });
  assert.equal(b.actor.system.bodyIndex.value, 1.25);
  b = op(b, { op: "setBodyIndex", value: 7.5 });   // above natural Body: overstress, allowed (r4)
  b = op(b, { op: "setMagic", value: 5, type: "full_magician", tradition: "shamanic", totem: "dog" });
  refused(() => op(b, { op: "setMagic", value: 5, type: "full_magician", tradition: "hermetic", totem: "dog" }), /shaman/);
  b = op(b, { op: "setReactionMod", mod: 2 });
  b = op(b, { op: "setCombatPoolBonus", bonus: 1 });
  b = op(b, { op: "addCustomSkill", name: "Rumormill", category: "special", attribute: "intelligence", rating: 4 });
  refused(() => op(b, { op: "addCustomSkill", name: "X", category: "weird", attribute: "intelligence", rating: 4 }));
  const vest = built.entries.find(e => e.type === "armor" && e.book === "sr2" && e.name === "Armor Vest");
  b = op(b, { op: "addItem", catalogId: vest.id });
  const v = b.actor.items.at(-1);
  b = op(b, { op: "setEquipped", itemId: v._id, equipped: true });
  assert.ok(npcView(b).armor.ballistic >= vest.system.ballistic);
  refused(() => op(b, { op: "setEquipped", itemId: b.actor.items[0]._id, equipped: true }), /Only armor/);
  const drug = built.entries.find(e => e.flags?.sr2e?.drug);   // any book: an NPC needs no toggle
  b = op(b, { op: "addItem", catalogId: drug.id });
  assert.deepEqual(b.actor.items.at(-1).flags.sr2e.drug, drug.flags.sr2e.drug, "rule flags kept (code review r1 #1)");
  assert.equal(b.actor.items.at(-1).flags.sr2e.catalogId, drug.id);
  b = op(b, { op: "removeItem", itemId: v._id });
  refused(() => op(b, { op: "removeItem", itemId: v._id }));
  refused(() => op(b, { op: "setRace", race: "dragon" }));
  refused(() => op(b, { op: "nope" }));
  const a = npcActor(b);
  assert.equal(a.system.threatRating, 3);
  assert.equal(a.system.threatDice, true, "exported with Roll Threat dice on (system 0.172.0, p.187)");
  assert.doesNotMatch(a.system.biography ?? "", /by hand/);
  assert.equal(a.type, "npc");
  const tv = npcView(b);
  assert.deepEqual([tv.threat, tv.combatPool, tv.astralPool, tv.magicPool], [3, 0, 0, 0], "no Dice Pools in threat mode");
  const off = npcActor(op(b, { op: "setThreatRating", rating: 0 }));
  assert.equal(off.system.threatDice, false);
  assert.ok(npcView(op(b, { op: "setThreatRating", rating: 0 })).combatPool > 0, "pools back with no Threat Rating");
});

test("HTTP: create from a book NPC, run NPC ops on their own route, export; the character route refuses them; admin counts", async () => {
  const t = await testContext(), ORIGIN = "https://hoi.example";
  const app = await buildApp({ ctx: t.ctx, config: loadConfig({ NODE_ENV: "production", BASE_URL: ORIGIN }), logger: false, catalog });
  const res = await app.inject({ method: "POST", url: "/api/redeem", headers: { origin: ORIGIN }, payload: { secret: (await A.bootstrap(t.ctx)).secret, username: "Boss", password: PW } });
  const cookie = res.headers["set-cookie"].split(";")[0], csrf = (await app.inject({ url: "/api/session", headers: { cookie } })).json().csrf;
  const call = (method, url, body) => app.inject({ method, url, headers: { origin: ORIGIN, cookie, "x-csrf-token": csrf, ...(method === "GET" ? {} : { "idempotency-key": randomUUID() }) }, ...(body !== undefined ? { payload: body } : {}) });
  const made = await call("POST", "/api/documents/npcs", { catalogId: idOf("Fixer"), name: "Fixer Joe" });
  assert.equal(made.statusCode, 200, made.body);
  const { document } = made.json();
  assert.equal(document.kind, "npc");
  assert.equal((await call("POST", "/api/documents/npcs", { catalogId: "sr2e.nope.x", name: "X" })).statusCode, 422);
  const ok = await call("POST", `/api/documents/${document.id}/npc-ops`, { revision: 1, ops: [{ op: "setThreatRating", rating: 2 }, { op: "applyExperience", years: 4, attributes: true, skills: true, resources: false }] });
  assert.equal(ok.statusCode, 200, ok.body);
  assert.equal(ok.json().body.actor.system.threatRating, 2);
  assert.equal((await call("POST", `/api/documents/${document.id}/npc-ops`, { revision: 2, ops: [{ op: "setProfessionalRating", rating: 9 }] })).statusCode, 400, "the schema's bound");
  assert.equal((await call("POST", `/api/documents/${document.id}/npc-ops`, { revision: 2, ops: [{ op: "setName", name: "Y", extra: 1 }] })).statusCode, 400);
  assert.equal((await call("POST", `/api/documents/${document.id}/ops`, { revision: 2, ops: [{ op: "setName", name: "Y" }] })).statusCode, 409, "not a character");
  const exp = await call("GET", `/api/documents/${document.id}/foundry`);
  assert.equal(exp.statusCode, 200);
  assert.match(exp.headers["content-disposition"], new RegExp(`fvtt-Actor-Fixer-Joe-${document.id}\\.json`));
  const actor = exp.json();
  assert.deepEqual([actor.type, actor.name, actor.system.threatRating, actor._stats.systemId], ["npc", "Fixer Joe", 2, "sr2e"]);
  assert.equal((await call("POST", "/api/documents/npcs", { name: "Blank" })).statusCode, 200);
  const me = (await call("GET", "/api/admin/users")).json().users[0];
  assert.equal(me.made.npc, 2);
  assert.ok(Object.keys(NPC_OPS).length >= 20);
  await app.close();
});
