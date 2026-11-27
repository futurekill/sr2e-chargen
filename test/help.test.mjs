/** The in-app help (docs/PLAN-help-footer.md 1): safe markup, every page's help link lands, shots exist with alt text. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { SECTIONS, helpFor } from "../client/src/help/sections.js";
import { tokens, safeHref } from "../client/src/help/markup.js";

test("markup: bold and internal links only; everything else stays text (r1 #7)", () => {
  assert.deepEqual(tokens("a **b** [c](/help/x#y) d"), [{ text: "a " }, { bold: "b" }, { text: " " }, { link: "c", href: "/help/x#y" }, { text: " d" }]);
  for (const bad of ["[x](javascript:alert(1))", "[x](//evil.example/a)", "[x](/a\" onclick=\"x)", "[x](https://evil.example)", "[x](/A_B)"])
    assert.ok(tokens(bad).every(t => t.text !== undefined), `${bad} stays text`);
  assert.deepEqual(tokens("<script>alert(1)</script> & \"q\""), [{ text: "<script>alert(1)</script> & \"q\"" }], "no HTML is made: Svelte escapes text");
  assert.deepEqual(tokens("**unbalanced and [half](/x"), [{ text: "**unbalanced and [half](/x" }]);
  assert.equal(safeHref("https://github.com/o/r/issues", "https://github.com/o/r"), "https://github.com/o/r/issues");
  assert.equal(safeHref("https://github.com/other/r", "https://github.com/o/r"), null);
});

test("every section is well formed; every internal link and every page's help link lands on a section and anchor", () => {
  const ids = new Set(SECTIONS.map(s => s.id));
  assert.equal(ids.size, SECTIONS.length);
  const target = (href) => {
    const m = /^\/help(?:\/([a-z0-9-]+))?(?:#([a-z0-9-]+))?$/.exec(href);
    assert.ok(m, `${href} is a help path`);
    if (!m[1]) return;
    const s = SECTIONS.find(x => x.id === m[1]);
    assert.ok(s, `${href}: section ${m[1]}`);
    if (m[2]) assert.ok(s.parts.some(p => p.id === m[2]), `${href}: anchor ${m[2]}`);
  };
  for (const s of SECTIONS) {
    assert.ok(s.title && s.intro && s.parts.length, s.id);
    for (const p of s.parts) for (const t of [...(p.steps ?? []), ...(p.notes ?? [])]) for (const k of tokens(t)) if (k.href) target(k.href);
  }
  const tabs = ["concept", "priorities", "metatype", "magic", "attributes", "skills", "resources", "finish", "card", "karma", "nuyen", "condition"];
  for (const tab of tabs) target(helpFor({ kind: "character", tab }));
  for (const c of [{ kind: "vehicle" }, { kind: "vehicle", designed: true }, { kind: "npc" }, { kind: "draft" }, { page: "library" }, { page: "catalog" }, { page: "account" }, { page: "admin" }, { signedIn: false }])
    target(helpFor(c));
  assert.equal(helpFor({ kind: "character", tab: "nuyen" }), "/help/after-creation#nuyen", "finished-character tabs (r2 #2)");
  assert.equal(helpFor({ signedIn: false }), "/help/getting-started", "sign-in, invite and reset (r3 #2)");
});

test("every screenshot a section names exists and says what it shows", () => {
  for (const s of SECTIONS) for (const shot of s.shots ?? []) {
    assert.ok(existsSync(new URL(`../client/public/help/${shot.file}`, import.meta.url)), `${s.id}: ${shot.file}`);
    assert.ok(shot.alt.length > 40, `${shot.file}: alt text says what it shows`);
    assert.ok(s.parts.some(p => p.id === shot.part), `${shot.file}: placed in a part`);
  }
});
