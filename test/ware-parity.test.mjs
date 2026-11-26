/** Rule-bearing ware against Foundry's own prepared values (docs/PLAN-M5i.md, Proof). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { derive, UNARMED_STRIKE } from "../shared/derive.mjs";
import { newCharacter, validate } from "../shared/creation.mjs";

const fixture = JSON.parse(readFileSync(new URL("fixtures/parity/ware-v0.168.0.json", import.meta.url), "utf8"));

for (const want of fixture.actors) {
  test(`ware parity: ${want.name} (${want.ruleset})`, () => {
    const got = derive({ actor: want.source });
    const where = (k) => `${want.name}: ${k}`;
    for (const [k, v] of Object.entries(want.attributes)) assert.equal(got.attributes[k], v, where(k));
    assert.equal(got.reaction, want.reaction, where("reaction"));
    assert.equal(got.initiativeDice, want.initiativeDice, where("initiative dice"));
    assert.equal(got.essence, want.essence, where("essence"));
    for (const k of ["combat", "magic", "astral", "hacking"]) assert.equal(got.pools[k], want.pools[k], where(`${k} pool`));
    assert.equal(want.ruleset === "rigger2" ? got.pools.controlRigger2 : got.pools.control, want.pools.control, where("control pool"));
    assert.deepEqual(got.armor, want.armor, where("armor"));
    assert.deepEqual(got.weapons.filter(w => w.id !== UNARMED_STRIKE._id).map(w => [w.name, w.damageCode]), want.weapons, where("weapons"));   // the virtual fist: Foundry adds the real one at creation
    assert.equal(got.enhancerExcess, want.mbw.enhancerExcess, where("enhancer excess"));
    assert.equal(got.mbwLevel, want.mbw.level, where("move-by-wire level"));
    // Foundry's conflict texts and the app's warnings name the same implants.
    const b = newCharacter("x"); b.actor = structuredClone(want.source); b.actor.system.chargen.inProgress = false; b.creation.finished = { at: 1 };
    // Whole texts: Foundry puts the page in the text, the app in the citation (code review r1 #3).
    const norm = (t) => t.replace(/ \(p\.\d+(–\d+)?\)/g, "").replace(/\.$/, "");
    const warned = validate(b).problems.filter(p => /move-by-wire/.test(p.text)).map(p => norm(p.text)).sort();
    assert.deepEqual(warned, want.mbw.conflicts.map(norm).sort(), where("move-by-wire warnings"));
  });
}
