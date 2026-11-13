# Plan review log: sr2e-chargen

## Round 1 — Codex (draft 1, fresh session): REVISE, 16 findings
1. The derivation interface omitted inputs (flags, effect records, uuid, world time, settings, registered tables).
2. M2 omitted item preparation and module registration. 3. Linked vehicles and bound spirits are references to
other actors, not embedded. 4. No lossless-editing rules (field ownership, deletions, identity). 5. Compendium
relinking could overwrite customisation. 6. Images don't travel. 7. Migrations underspecified. 8. A warning can't
stop Foundry recomputing under the world's settings. 9. Ledger history/undo needs concurrency and idempotency.
10. DB copy/backup lacked safeguards; MySQL untested; same-volume backups. 11. No auth lifecycle. 12. Rich text and
imported ownership unhandled. 13. Upload/PDF DoS paths. 14. The fit test couldn't prove nothing was omitted; table
card wording. 15. A published image could redistribute book content; U12 hook had no milestone. 16. Dice log,
citations and broader parity fixtures had no milestone.

### Claude's response (draft 2)
All taken: D9 DeriveContext with declared inputs and supported AE semantics (unsupported = view-only, warned); M2
starts with item preparation and pure module `register()` adapters, gated on broader parity fixtures; exports are
bundles (document graph, `portable:` references, `unresolved[]`) with complete sources, field ownership, `edits[]`,
`deleted[]`, `portableId` identity; embedded items authoritative (provenance-only relink); assets in a zip, uploaded on
Foundry import; D10 pure migrations with historical fixtures; explicit acceptance of the world's rules; revisions +
optimistic concurrency + idempotency keys, undo as compensating changes; maintenance-mode DB copy with canonical
checksums, all three dialects in CI, off-volume backups with restore verification; admin CLI and server-side sessions;
ownership never restored, sanitised display; worker/queue/pixel limits, fail-not-truncate; fit test checks complete
consumption and glyph coverage, table card = named subset; image ships no content (content mount), U12 tagging in
M3; M1b citations, dice log in M6.

## Round 2 — Codex (draft 2, fresh session): REVISE, 10 findings
1. Identities inside data (hashed flag keys, event keys, effect origins) weren't remapped. 2. The unsupported-effect
fallback had no prepared snapshot. 3. Shared derivation doesn't share Foundry's mutation hooks. 4. Conflicting
authorities (`source` vs `character.play` vs `_foundry`; embedded vehicles in D6/Workshop). 5. Migration dispatch
ignored system/Foundry/module versions. 6. ZIP imports lacked archive defences. 7. Worker threads don't bound native
memory. 8. A git dependency on the system would pull book content into the image. 9. Backups omitted assets.
10. The table card had unbounded content.

### Claude's response (draft 3)
All taken. D11 typed reference adapters (unknown kinds block export); D12 prepared snapshot + whole-document view-only;
D13 shared transition functions (v1: damage, Karma, nuyen, purchases, ammo; others blocked where they apply); D5 one
authority (`source`), no `character.play`/`_foundry`; D6 graph references (Workshop too); D10 dispatch on envelope,
system (existing migrations via adapter), Foundry and module versions; bounded streaming archive import; renderer in a
killable child process; a code-only `sr2e-core` package from the system release + image-layer inspection; backups
include assets with checksums; table card content budget with fit preview.
