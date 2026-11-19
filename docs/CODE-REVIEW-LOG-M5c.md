# Code review log: M5c (shapeshifter characters), 2026-11-19

System commits 4472f6a4 + the adept-pricing follow-up (release/0.161.0); app chargen/on-0.161.

## Round 1 (Codex gpt-6-sol, high): 4 findings, all fixed
1. The animal form carried adept-power modifiers (powers work only in human form). Fixed in derive.
2. Karma advancement priced the human-form rating. Fixed: `withRacial` is base + racial; the form modifier is added
   only where it belongs.
3. The Attributes tab hid the form modifier. Fixed: the column shows it ("Human form ±").
4. One radio name across two ARIA groups. Fixed: species radios have their own group and name.

## Round 2 (medium): 1 finding, fixed in both repos
- Improved Physical Attributes priced without the human-form modifier. Fixed: the system's `humanFormMod` counts as
  racial for that price (R4), in Foundry and the app.

## Round 3 (medium): APPROVED
