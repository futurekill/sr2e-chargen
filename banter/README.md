# Banter (U11)

In-character BBS commentary for the builder — `>>>>>[ text ]<<<<<` then `—Handle <stamp>` — shown beside the step,
item or choice it's keyed to, toggleable, **never** printed on a sheet or included in any export (M4 adds the test).

Files: `steps.json`, `metatypes.json`, `choices.json`, `items.json`. Each is
`{ schema: "sr2e-banter", version, set, source, entries: { "<key>": [ { handle, text, stamp } ] } }`.

Keys:
- `step:<id>` — the builder steps (start, priorities, metatype, magic, attributes, skills, edges, resources,
  contacts, lifestyle, finish);
- `metatype:<race>` — the system's race keys;
- `choice:<path>` — a decision (`priority.<category>.<letter>`, `essence.low`, `magic.with.cyberware`, …);
- `itemtype:<type>` — an item type; `item:<catalog id>` for a specific item.

`set: "original"` / `source: "original"` is this repo's own writing with its own handles (U12: book quotes only in the
full-content mode, tagged with their source). Several lines on one key are shown as a thread, in order.
