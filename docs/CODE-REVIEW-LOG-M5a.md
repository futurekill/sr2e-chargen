# Code review log: M5a (sourcebook toggles), 2026-11-19

## Round 1 (Codex gpt-6-sol, high): 5 findings
1. A creation record of a sold item kept its book "in use". Fixed: a finished character counts only its items and
   vehicles.
2. Book gear rated above 6 was offered at creation. Partly fixed (see round 2/3): refused where the rating is a choice
   that would be cut to 6; a fixed rating above 6 is bought and reported by the rules check, as core.
3. The offerable search disagreed with addSkill/addVehicle. Fixed: `offeredBy` handles skills and vehicles.
4. New characters lacked `options.books`. Fixed: `[]`.
5. The Sourcebooks list lacked the offered/later counts. Fixed: computed at catalog load, shown per book.

## Round 2 (medium, fix-only): 1 finding
- Refuse every authored rating above 6, core included. Declined by design: breakable rules are reported, not refused
  (applyOp's contract; the core gyro test). Refused only where the rating is a choice.

## Round 3 (medium): APPROVED (the rating logic and that validate reports fixed ratings above 6).
