# Plan: milestone 2d — contacts, lifestyle, allergy, programs, and finishing
_Draft 3 (2026-11-19), after Codex plan rounds 1–3 (7 + 3 + 1 findings, the last folded in; docs/PLAN-M2d-REVIEW-LOG.md; the "Draft 2" and "Draft 3" sections at the end win). The slice docs/PLAN-M2.md §4 and §7 left for "the S release"; built on the local app branch
`chargen/on-0.161` against the system's release/0.161.0 (pushed after that release). Rules: core p.43–47, read on the
page. Parent text in docs/PLAN-M2.md (§3 operations, §4 validation and Finish, §5b routes); this file settles the
details and wins where it is more precise._

## 1. One budget: the system's `chargenBudget`
`validate()` stops building its own allotments and item inputs and calls the system's
`chargenBudget({ system: actor.system, items: actor.items, table: TABLES.priorities })` — the same call Foundry's
panel makes. It already prices programs, lifestyles (cost × months), contacts and extras, the allergy bonus
(metahumans only), vehicle receipts, Force Points (magicians only) and everything M2c buys. The app keeps only what the
budget doesn't do: the per-item and per-step checks, power points (`adeptPowerBudget`), the messages.
- The existing resource, skill and attribute tests must pass unchanged (the same numbers by a different road), plus
  one test that compares `validate().budgets` with a direct `chargenBudget` call on a full character.

## 2. Contacts and extras (p.43–44, p.46)
- **Contacts and buddies** come from the catalog's core contacts (the `contacts` pack: archetypes such as Fixer,
  Street Doc). `addItem` accepts them; choice `kind`: `contact` | `buddy` (projected to `contactType`). Two contacts
  are free, each further one 5,000¥, a buddy 10,000¥ (`chargenExtrasCost`, inside the budget). One buddy at most:
  a second is a rules-check error (p.43). Loyalty/influence are not creation choices (left at the entry's values).
- **A gang or tribe, and followers** are not catalog entries: `addExtra { kind: "gang" | "follower", name }` makes a
  contact item with no catalog source (`contactType` gang/follower, 50,000¥ / 200,000¥).
  - A gang's members are 2D6, **rolled once by the server** when it is added (p.44): the ops route fills `op.roll`
    with `crypto.randomInt` and ignores any value the client sent; the library's idempotent write stores the result,
    so a replay never re-rolls. `applyOp` stays pure (the dice are an input). The client sends this op without
    applying it first and shows the server's answer.
  - Followers name five different archetypes (`setExtra { itemId, archetypes: [5 strings] }`); fewer than five, a
    blank or a repeat is a to-do / error in the rules check.
- `removeItem` removes any of them. An enemy, friend-for-life and the Companion's tiers are not creation choices (M5).

## 3. Lifestyle (p.46)
- A core lifestyle entry (`lifestyles` pack: Streets … Luxury) is added with `addItem`; choice `months` (1–60, a
  sanity bound; the book sets none). Only one: adding a second replaces the first (one operation, so the budget never
  sees two).
- The rebuild writes `actor.system.lifestyle` from the lifestyle item's `level`, or `"streets"` when there is none
  (p.46: no lifestyle bought = the street), never the system's default `low`. The free local dialect (p.74) already
  reads `actor.system.lifestyle`.

## 4. Allergy (p.46, metahumans only)
- `setAllergy { substance, rarity, severity, rarityBonus, severityBonus }` writes `actor.system.chargen.allergy` (the
  system's field, S8), every value checked against the system's choices; `substance` ≤ 60 characters. Clearing it
  sets all to `""`.
- The budget adds `allergyBonus` only for dwarf/elf/ork/troll (the system's rule); the rules check reports an allergy
  on a human (it grants nothing), a rarity without a severity or a bonus, and a missing substance.

## 5. Programs (p.46 incidentals, p.165)
- Core programs (`programs` pack) are buyable with `addItem`; choice `rating` 1–6 (no starting gear above 6, p.46).
  Priced by the system (rating, multiplier, persona programs from rating 4). No deck-capacity check at creation
  (memory is a play rule; reported later in milestone 4).

## 6. Finish (p.47)
- `finish` needs a clean rules check (no error, no to-do). The server rolls 3D6 (`crypto.randomInt`, as in §2) and
  `applyOp` writes, in ONE revision:
  - `actor.system.nuyen` = the system's `startingMoney(resources.remaining, roll)` — unspent Resources ÷ 10, rounded
    down, + roll × 1,000¥;
  - `actor.system.chargen.inProgress = false`, and the flag `flags.sr2e.startingMoneyGranted = true` so Foundry never
    offers the starting money again on import;
  - `creation.finished = { at, leftover, roll, nuyen, karmaPool }` (Karma Pool from `startingKarmaPool`, p.47 —
    Foundry derives the pool itself; this is the record).
- After finishing, every creation operation is refused ("finished on <date>; changes after creation are milestone
  4's"); `setName` and `setNotes` still work. A second `finish` is refused; a replayed request returns the stored
  result (the library's idempotency), never a second roll.
- **Revisions** (PLAN-M2 §5b): restoring a revision of a character is allowed only while the character is unfinished,
  and only to an unfinished revision.
- The client: a **Finish** section with what will happen ("15,000¥ unspent → 1,500¥ + 3D6 × 1,000¥"), a confirm
  dialog, then the result; the page becomes read-only except name and notes.

## 7. Client
- A **Contacts & lifestyle** step: the contact search (core contacts), each row's kind (contact/buddy), "Add a gang or
  tribe" / "Add followers" with a name, followers' five archetype fields; the lifestyle picker with months; the price
  of each from the budget.
- The **Metatype** step gains the allergy form (metahumans only, hidden for humans with a note).
- The rules panel: Nuyen row now includes contacts and lifestyle (it is the system's number).

## 8. Tests
- Budget equality (§1). Contacts: two free, the third 5,000¥, a buddy 10,000¥, a second buddy reported, a gang's
  members from the injected roll (2–12, refused outside), followers' archetypes checks. Lifestyle: months × cost, a
  second replaces, none → streets, Streets enables the dialect. Allergy: an elf's Common/Severe with Attributes +
  Skills bonuses raises the allotments 2 and 4; a human's is reported and grants nothing; bad values refused.
  Programs: rating 1–6, a persona program's price at rating 4. Finish: the book's example (15,000¥ left → 1,500¥),
  refused with an error or to-do, the roll stored and not repeated on replay, creation ops refused afterwards, revision
  restore refused after finish. Server: the roll comes from the server even when the client sends one.

## Out of scope
Vehicles at creation (S9's app side: its own slice next, needs `vehicles.json`); sourcebook contacts and lifestyles,
Edges and Flaws, Companion contact tiers (M5); in-play changes after finishing (M4).

## Draft 2 — changes after round 1 (these win)
- **Server rolls never pass through the public op** (r1 #1): the public schemas of `addExtra` and `finish` have no
  roll field (an extra field is refused, as today). The library's `applyOps` is given a `dice(op)` callback by the
  route; INSIDE the idempotent, revision-conditional transaction, after the idempotency lookup (a replay returns the
  stored answer before any roll), it rolls (`crypto.randomInt`, 2D6 or 3D6, checked 2–12 / 3–18) and passes the
  values to the pure `applyOp(body, op, lookup, { roll })` as a separate, private argument. The fingerprint is the
  request as sent. Tests: a client `roll` is refused by the schema; a replay returns the first roll; two concurrent
  finishes — one wins (the revision condition), the other gets "stale".
- **Name and notes after finishing** (r1 #2): `setName` and `setNotes` become metadata edits that return BEFORE the
  item rebuild, on finished and unfinished characters alike; every other op on a finished character is refused first
  thing in `applyOp`.
- **Free entries are buyable** (r1 #3): the `price <= 0` refusal applies only to the types that need a fixed price
  (weapon, armor, gear, ammo, cyberware, program, focus) — contacts (two are free) and the Streets lifestyle (0¥) pass.
- **Per-operation public schemas** (r1 #4): each op's schema lists its own fields with required/optional, types and
  bounds: `addItem { catalogId }` (choices come by `setItem`, as today), `setItem { itemId, choices }` (choices an
  object, checked by the reducer per type), `addExtra { kind: gang|follower, name ≤ 60 }`, `setExtra { itemId,
  archetypes: array of ≤ 5 strings ≤ 60 }`, `setAllergy { substance, rarity, severity, rarityBonus, severityBonus }`
  (all strings, enums checked), `finish {}`. The reducer checks again.
- **Every budget problem is a validation error** (r1 #5): each `resources.vehicleProblems` entry becomes a
  Resources error (blocks finishing).
- **Allergy all-or-nothing** (r1 #6): valid states are all five fields empty, or a substance plus a rarity, a
  severity and both bonus categories (nuisance severity: its bonus category is still chosen, worth 0). Every partial
  state is a to-do naming what's missing; the op itself accepts partial input (building is iterative).
- **Two contacts** (r1 #7): fewer than two ordinary contacts (`contactType` contact) is a to-do: "Choose your two free
  contacts (p.43)". It blocks finishing.

## Draft 3 — changes after round 2 (these win)
- **Changing to human clears the allergy** (r2 #1): `setMetatype` to human sets all five allergy fields to `""` in
  the same operation (an allergy is for metahumans only, p.46), so no hidden form is needed to clear it.
- **The table card stays editable** (r2 #2): `setCard` joins `setName` and `setNotes` as a metadata edit allowed on a
  finished character, returning before the item rebuild.
- **Follower archetypes are the player's names** (r2 #3, declined as a hard check): p.44 lets the player choose "any
  five different Archetypes", and a buddy may be a "gamemaster-approved" one (p.43), so the app does not refuse a name
  outside a list. The five fields suggest the core book's archetype names (a datalist), and the rules check requires
  five, non-blank, different. The GM approves the character.
