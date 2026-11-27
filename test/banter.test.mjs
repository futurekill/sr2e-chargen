/** The Shadowland board (docs/PLAN-help-footer.md 3, PLAN.md U11): the data, the picking, never on a sheet or export. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { banterProblems, mergeBanter, contextKeys, pickThread, characterChoices } from "../shared/banter.mjs";

const dir = new URL("../banter/", import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith(".json")).map(f => [f, JSON.parse(readFileSync(new URL(f, dir), "utf8"))]);
const data = mergeBanter(files.map(([, d]) => d));
const allLines = Object.values(data).flat(2);

test("every banter file is valid version 2: threads of 2–4 lines, handles, texts, stamps; original only", () => {
  assert.ok(files.length >= 5);
  for (const [f, d] of files) assert.deepEqual(banterProblems(d, f), []);
  assert.ok(allLines.length >= 150, `${allLines.length} lines`);
  for (const k of ["library", "catalog", "account", "admin", "help", "sign-in", "character", "vehicle", "workshop", "npc", "draft", "any"])
    assert.ok((data[`page:${k}`] ?? []).length >= 2, `page:${k} has threads`);
  for (const s of ["concept", "priorities", "metatype", "magic", "attributes", "skills", "resources", "finish", "card", "karma", "nuyen", "condition"])
    assert.ok(data[`step:${s}`]?.length, `step:${s} has a thread (a Character tab)`);
  assert.ok(banterProblems({ schema: "sr2e-banter", version: 2, set: "original", source: "original", entries: { "page:x": [[{ handle: "A", text: "one", stamp: "00:00:00/01-01-57" }]] } }, "t").length, "a one-line thread is refused");
});

test("the v1 → v2 conversion kept every original line under its key", () => {
  const v1 = JSON.parse(readFileSync(new URL("fixtures/banter-v1.json", import.meta.url), "utf8")).lines;
  assert.equal(v1.length, 32);
  for (const l of v1) assert.ok((data[l.key] ?? []).some(t => t.some(x => x.handle === l.handle && x.text === l.text)), `${l.key}: ${l.text}`);
});

test("context: most specific first, page:any last; picking is seeded, avoids the last thread, falls back", () => {
  assert.deepEqual(contextKeys({ page: "character", step: "magic", race: "elf", choices: ["priority.magic.A"] }),
    ["choice:priority.magic.A", "step:magic", "metatype:elf", "page:character", "page:any"]);
  assert.deepEqual(contextKeys({}), ["page:any"]);
  const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
  assert.equal(pickThread(data, ["step:magic", "page:any"], seq(0.1, 0.0)).id, "step:magic#0", "sticks to the first key");
  assert.match(pickThread(data, ["step:magic", "page:any"], seq(0.9, 0.0)).id, /^page:any#/, "else falls through to page:any");
  const avoided = pickThread(data, ["page:any"], seq(0.1, 0.0), { avoid: "page:any#0" });
  assert.notEqual(avoided.id, "page:any#0", "two loads in a row differ (r2 #3)");
  assert.equal(pickThread({}, ["page:x"], Math.random), null);
  // A key whose only thread was just shown is passed over for one that has another (code review r1 #2).
  const two = { "choice:x": [["a"]], "page:any": [["b"], ["c"]] };
  assert.match(pickThread(two, ["choice:x", "page:any"], seq(0.1, 0.0), { avoid: "choice:x#0" }).id, /^page:any#/);
  assert.equal(pickThread({ "page:any": [["b"]] }, ["page:any"], seq(0.1, 0.0), { avoid: "page:any#0" }).id, "page:any#0", "only one thread anywhere: shown again");
  for (const [k, ts] of Object.entries(data)) ts.forEach((t, i) => assert.deepEqual(pickThread(data, [k], seq(0.0, i / ts.length + 1e-9)).lines, t));
});

test("a character's choices for the board: priority letters, low Essence, magic with cyberware", () => {
  const body = { actor: { system: { chargen: { priorities: { magic: "A", resources: "E", race: "" } }, magic: { type: "full_magician" } }, items: [{ type: "cyberware" }] } };
  assert.deepEqual(characterChoices(body, 1.5), ["priority.magic.A", "priority.resources.E", "essence.low", "magic.with.cyberware"]);
  assert.deepEqual(characterChoices({ actor: { system: {}, items: [] } }, 6), []);
});

test("U11: no banter line is ever on a sheet, a stat block or a Foundry export", async () => {
  const { sheetModel } = await import("../server/sheet/model.mjs");
  const { statBlock } = await import("../server/sheet/markdown.mjs");
  const { renderSheet } = await import("../server/sheet/render.mjs");
  const { toFoundryActor } = await import("../shared/foundry.mjs");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const runners = new URL("../content/sr2e-foundryvtt/packs-src/runners/", import.meta.url);
  const a = JSON.parse(readFileSync(new URL(readdirSync(runners).find(f => /Razor/.test(f)), runners), "utf8"));
  const body = { name: a.name, notes: "", creation: { options: {}, items: {}, finished: { at: 1 } }, actor: a };
  const { pdf } = await renderSheet(sheetModel(body), { style: "fohawk" });
  const doc = await getDocument({ data: new Uint8Array(pdf) }).promise;
  let pdfText = "";
  for (let n = 1; n <= doc.numPages; n++) pdfText += (await (await doc.getPage(n)).getTextContent()).items.map(i => i.str).join(" ");
  const outputs = [statBlock(sheetModel(body)), JSON.stringify(toFoundryActor(body, "0.171.0")), pdfText];
  for (const l of allLines) for (const out of outputs) assert.ok(!out.includes(l.text), `banter in an output: ${l.text}`);
});
