/** Cyberlimbs against Foundry's own prepared values (docs/PLAN-M5j.md, Proof): sources built by the app's ops. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { derive } from "../shared/derive.mjs";
import { essenceOf, limbOptionCostOf } from "../shared/purchase.mjs";

const fixture = JSON.parse(readFileSync(new URL("fixtures/parity/limbs-v0.168.0.json", import.meta.url), "utf8"));

for (const want of fixture.actors) {
  test(`limb parity: ${want.name} (${want.ruleset})`, () => {
    const actor = want.source, got = derive({ actor });
    const where = (k) => `${want.name}: ${k}`;
    for (const [k, v] of Object.entries(want.attributes)) assert.equal(got.attributes[k], v, where(k));
    assert.equal(got.reaction, want.reaction, where("reaction"));
    assert.equal(got.initiativeDice, want.initiativeDice, where("initiative dice"));
    assert.equal(got.essence, want.essence, where("essence"));
    for (const k of ["combat", "magic", "astral", "hacking"]) assert.equal(got.pools[k], want.pools[k], where(`${k} pool`));
    assert.equal(want.ruleset === "rigger2" ? got.pools.controlRigger2 : got.pools.control, want.pools.control, where("control pool"));
    assert.deepEqual(got.armor, want.armor, where("armor"));
    assert.deepEqual(got.weapons.map(w => [w.name, w.damageCode]), want.weapons, where("weapons"));
    assert.deepEqual([got.limbs.anyCyber, got.limbs.avgStrength, got.limbs.avgQuickness, got.limbs.pairBody], [want.limbs.anyCyber, want.limbs.avgStrength, want.limbs.avgQuickness, want.limbs.pairBody], where("limbs"));
    for (const [id, w] of Object.entries(want.items)) {
      const item = actor.items.find(i => i._id === id);
      assert.equal(Math.round(essenceOf(item, actor.items, actor.system.race) * 1000) / 1000, w.essence, where(`${item.name} Essence`));
      assert.deepEqual([!!item.system.limbSurcharge, !!item.system.limbAdjacent], [w.surcharge, w.adjacent], where(`${item.name} placement`));
      if (item.system.limbOption) assert.equal(limbOptionCostOf(item, actor.items), w.cost, where(`${item.name} price`));
    }
  });
}
