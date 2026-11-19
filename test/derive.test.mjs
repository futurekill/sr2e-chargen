/** Derived values against Foundry's own (docs/PLAN-sheet.md, parity): the pregens' sources from the pinned system copy,
 * their prepared values exported from Foundry at the same version. Any difference fails and names the value. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { derive } from "../shared/derive.mjs";

const fixture = JSON.parse(readFileSync(new URL("fixtures/parity/runners-v0.161.0.json", import.meta.url), "utf8"));
const dir = new URL("../content/sr2e-foundryvtt/packs-src/runners/", import.meta.url);
const sources = Object.fromEntries(readdirSync(dir).filter(f => f.endsWith(".json")).map(f => { const a = JSON.parse(readFileSync(new URL(f, dir), "utf8")); return [a._id, a]; }));
const system = JSON.parse(readFileSync(new URL("../content/sr2e-foundryvtt/system.json", import.meta.url), "utf8"));

test("the parity fixture matches the pinned system version", () => assert.equal(fixture.version, system.version, "regenerate test/fixtures/parity when the pin moves"));

for (const want of fixture.actors) {
  test(`parity: ${want.name}`, () => {
    const got = derive({ actor: sources[want.id], options: { moreMetahumans: false } });
    const where = (k) => `${want.name}: ${k}`;
    for (const [k, v] of Object.entries(want.attributes)) assert.equal(got.attributes[k], v, where(k));
    assert.equal(got.reaction, want.reaction, where("reaction"));
    assert.equal(got.initiativeDice, want.initiativeDice, where("initiative dice"));
    assert.equal(got.essence, want.essence, where("essence"));
    assert.equal(got.magic, want.magic, where("magic"));
    for (const k of ["combat", "magic", "astral", "control", "hacking"]) assert.equal(got.pools[k], want.pools[k], where(`${k} pool`));
    assert.deepEqual(got.armor, want.armor, where("armor"));
    assert.deepEqual([got.monitors.physical, got.monitors.stun], [want.monitors.physical, want.monitors.stun], where("monitors"));
    assert.equal(got.karmaPool, want.karmaPool, where("karma pool"));
    assert.deepEqual(got.weapons.map(w => [w.name, w.damageCode]), want.weapons, where("weapons"));
  });
}

test("creation holds an attribute at the racial maximum, as Foundry does (code review r1 #4)", () => {
  const actor = { name: "x", type: "character", items: [], system: { race: "human", magic: { type: "none" }, chargen: { inProgress: true },
    body: { base: 12 }, quickness: { base: 3 }, strength: { base: 3 }, charisma: { base: 3 }, intelligence: { base: 3 }, willpower: { base: 3 } } };
  assert.equal(derive({ actor }).attributes.body, 6);
  actor.system.chargen.inProgress = false;
  assert.equal(derive({ actor }).attributes.body, 12, "after creation the maximum is the advancement rule's, not this clamp");
});
