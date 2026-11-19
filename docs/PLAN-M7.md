# Plan: milestone 7 — the Foundry connector (roadmap item 7, the simple form)
_Draft 2 (2026-11-19), BUILT (Draft 2's changes win). Live-checked: the export imports into Foundry 0.161.0 cleanly. ROADMAP item 7: "Export a character from the app and import it into Foundry as a new actor.
Export a settled character from Foundry to the app. No in-play state." PLAN.md's full interchange (bundles, portable
ids, D10 migrations, reference adapters) stays the long-term design; this slice uses Foundry's own document JSON,
which needs no Foundry code._

## App → Foundry
- `GET /api/documents/:id/foundry` (owner only): the character as a Foundry **actor document JSON** — what Foundry's
  sidebar "Import Data" reads (`ClientDocumentMixin.importFromJSON`: fromCompendium + update): `name`, `type:
  "character"`, `system` (the body's `actor.system`), `items` (each with its `_id`, `name`, `type`, `img`, `system`,
  `flags`, `effects`, `_stats.compendiumSource`), `effects: []`, `flags` (the actor's), `prototypeToken: { name,
  actorLink: true, lockRotation: true }`, `_stats: { systemId: "sr2e", systemVersion: <the pinned system version>,
  exportSource: { worldId: null, uuid: null, coreVersion: null, systemId: "sr2e", systemVersion } }`, no `img` (the
  portrait is downloaded separately: Foundry stores file paths, not images).
- Vehicles bought at creation: `GET /api/documents/:id/foundry/vehicles/:key`, each the kept vehicle source as an actor
  JSON (the receipts in `system.chargen.vehicles` name them; the GM imports them as their own actors).
- The Print tab gains "Foundry": download buttons and the three steps (create an Actor of type Character → right-click →
  Import Data → choose the file; the same for each vehicle; set the portrait).

## Foundry → App
- `POST /api/documents/characters/import` (`BIG` body limit, idempotent): a Foundry character JSON (Foundry's "Export
  Data"). Checked: an object; `type === "character"`; `_stats.systemId` "sr2e" when present; `name` 1–120; at most
  `MAX_ITEMS` items, each an object with a string `type`; the encoded size ≤ the document limit; no key `__proto__`,
  `constructor` or `prototype` anywhere.
- The new body: `newCharacter(name)` with `actor` = `{ name, type, system, items, flags }` from the file (no `img`, no
  token, no effects in this slice — reported), `creation.finished = { at, imported: { from: "foundry", systemVersion } }`
  and `creation.items` empty: every item is foreign, so creation never rebuilds them, and play ops (Karma, nuyen,
  condition) work on the actor.
- Before saving, `derive` and `validate` run on it; a throw refuses the import ("this character can't be read").
- A character still in creation in Foundry (`chargen.inProgress`) is refused ("finish creation in Foundry first, or
  build it here").

## Tests
Export: valid JSON, items keep `_id`s and sources, no img; round trip — export, import, the same `actor.system` and
items. Import refusals: wrong type, other system, prototype keys, too many items, too big, in progress. Owner-only
routes; the session and CSRF.

## Out of scope
Effects, the portrait file, in-play state (damage, ledgers), matching an existing Foundry actor (import over), a ZIP of
the character with its vehicles and portrait, other actor types.

## Draft 2 — changes after round 1 (these win; folded without a round 2)
- **Version stamps** (r1 #1): an imported character keeps the `systemVersion` it came with, and its export stamps
  THAT version (so Foundry's migrations still run on it); an app-made character stamps the pinned version. An import
  without a `systemVersion`, or newer than the pinned system, is refused.
- **Finished means finished** (r1 #2): `system.chargen.inProgress === false` is required.
- **Item shapes** (r1 #3): every item needs a unique 16-character Foundry `_id` and a string `type`; skills get their
  missing `concentration`/`specialization` objects filled (name "", rating 0) as Foundry's schema defaults would.
- **Numbers** (r1 #4): `nuyen` a whole number 0–10,000,000; Karma fields whole numbers 0–100,000; attribute bases whole
  numbers 0–50; anything else refused with the field named.
- **The Finish tab** (r1 #5): an imported character shows "Imported from Foundry (system x.y.z)" and its current nuyen
  and Karma instead of the creation numbers.
- **Vehicles** (r1 #6): only vehicles bought in the app have downloads; an imported character's receipts are listed as
  "in Foundry" with no download.
