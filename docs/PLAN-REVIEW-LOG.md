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
