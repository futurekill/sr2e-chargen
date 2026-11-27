/** Rule-bearing bioware against Foundry's own prepared values (docs/PLAN-M5k.md, Proof): sources built by the app. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { derive } from "../shared/derive.mjs";
import { bodyCostOf } from "../shared/purchase.mjs";

const fixture = JSON.parse(readFileSync(new URL("fixtures/parity/bioware-v0.172.0.json", import.meta.url), "utf8"));

for (const want of fixture.actors) {
  test(`bioware parity: ${want.name} (${want.ruleset})`, () => {
    const actor = want.source, got = derive({ actor });
    const where = (k) => `${want.name}: ${k}`;
    for (const [k, v] of Object.entries(want.attributes)) assert.equal(got.attributes[k], v, where(k));
    assert.equal(got.reaction, want.reaction, where("reaction"));
    assert.equal(got.initiativeDice, want.initiativeDice, where("initiative dice"));
    assert.equal(got.essence, want.essence, where("essence"));
    assert.equal(got.bodyIndex.value, want.bodyIndex, where("Body Index"));
    for (const k of ["combat", "magic", "astral", "hacking"]) assert.equal(got.pools[k], want.pools[k], where(`${k} pool`));
    if (want.ruleset === "rigger2") assert.equal(got.pools.taskRigger2, want.pools.task, where("task pool"));
    assert.deepEqual(got.armor, want.armor, where("armor"));
    assert.equal(got.activeSkillDice, want.activeSkillDice, where("active skill dice"));
    assert.equal(got.articulation?.lost ?? null, want.articulation?.lost ?? null, where("articulation"));
    for (const [id, w] of Object.entries(want.items)) {
      const item = actor.items.find(i => i._id === id);
      assert.equal(Math.round(bodyCostOf(item, actor.items) * 1000) / 1000, w.bodyCost, where(`${item.name} Body Cost`));
      assert.equal(item.system.cost, w.cost, where(`${item.name} row cost`));
    }
  });
}
