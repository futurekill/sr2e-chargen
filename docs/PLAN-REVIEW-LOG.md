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

## Round 3 — Codex (draft 3, fresh session): REVISE, 5 findings
1. Unknown module flags would block an export (contradicts lossless transport). 2. DeriveContext lacked the immutable
source the data models read and restore from. 3. A source-only migration adapter loses the runner's semantics
(settings, owning-actor source, addItems, same-source pending entries). 4. A Foundry import could replay gameplay
hooks over already-transitioned state. 5. Vehicle derivations the Workshop needs were excluded from extraction.

### Claude's response (draft 4)
All taken: unknown flags travel opaquely, only identity-changing imports refuse unadaptable references; `source` in
DeriveContext + parity tests for removed mechanisms / double preparation; a pure runner extracted from migrations.mjs
keeping its semantics; an `sr2eImport` write mode the gameplay hooks skip, with edited round-trip tests; M8 starts by
extracting the Workshop's vehicle preparation.

## Round 4 — Codex (draft 4, fresh session): REVISE, 3 findings
1. MySQL `TEXT` (64 KB) can't hold the documents. 2. M1 Foundry import had no recovery from a half-done write.
3. The Shadowland banter (U11) had no milestone or acceptance gate.

### Claude's response (draft 5)
All taken: `LONGTEXT` on MySQL/MariaDB with a maximum document size tested across dialects; a recoverable import
(preflight, reserved identities, a journal of originals and writes, rollback/resume, failure-injection tests); banter
data, starter set, toggle and an export-exclusion test in M4.

## Round 5 — Codex (draft 5, fresh session): REVISE, 4 findings
1. Import isolation: write options can't stop queued reconcilers or other clients mid-import. 2. A crash window
between a write and its journal entry. 3. World-time instants (healing dueAt, move-by-wire since) break across worlds.
4. Image decoding lacked the renderer's resource isolation.

### Claude's response (draft 6)
All taken: affected actors fenced across clients (gameplay writers/reconcilers drain and skip; rollback refuses on
outside changes); write-intent + reserved ids journalled BEFORE each mutation, recovery reconciles idempotently against
the world; typed timestamp adapters export remaining durations and re-anchor on import; image work in the same
bounded, killable subprocess queue as PDF rendering.
