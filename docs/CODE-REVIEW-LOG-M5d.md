# Code review log: M5d (Edges and Flaws), 2026-11-19

System commits on release/0.161.0 (quality table, audit, effects; review fixes); app chargen/on-0.161.

## Round 1 (Codex gpt-6-sol, high): 7 findings, all fixed
1. Foundry's adept power pricing left out Bonus Attribute Point. Fixed (the natural rating includes it).
2. The audit accepted an Exceptional Attribute raising the maximum by 2. Fixed (exactly 1).
3. An effect rule moved onto another quality escaped the audit. Fixed (a mapped quality's rule must be its own; an
   unmapped quality may not carry a creation effect).
4. The Attributes tab showed the rating and maximum without the Edges. Fixed.
5. The page priced Extra Contact's contact. Fixed.
6. Quality detail was stored HTML-escaped (Foundry showed the entities). Fixed: plain text, < and > dropped.
7. Choice controls had no distinct accessible names. Fixed with `ctlName`.

## Round 2 (medium): 1 finding — names not distinct per row (two Allergies) and on the special selects. Fixed.
## Round 3 (medium): 2 findings — same name and detail; follower archetype inputs. Fixed. Then APPROVED.
