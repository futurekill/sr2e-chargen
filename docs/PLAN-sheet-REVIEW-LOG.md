# Plan Review Log: the printable sheet (roadmap milestone 3)

## Round 1 — Codex gpt-6-sol high
- **Reaction:** [PLAN-sheet.md](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-sheet.md:18) feeds augmented Quickness directly to `reactionBase`, but CharacterData excludes Muscle Replacement Quickness; pass the excluded bonus as the helper’s third argument.
- **Initiative:** The plan treats initiative as a fixed Reaction plus dice and may count a purchased Increased Reflexes spell as active; derive the printable `Reaction + nD6` from active effects and installed ware, matching [CharacterData](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:496).
- **Pools:** Show Magic Pool only for magicians, using Sorcery plus *active, bonded* power foci; derive Hacking and Control from the system’s deck and VCR rules instead of the plan’s abbreviated conditions. See [CharacterData](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/data/actor-data.mjs:1543).
- **Armor:** Bought armor starts unequipped in the catalog, and [purchase.mjs](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/shared/purchase.mjs:87) does not equip it; set an explicit creation default or print worn totals from actual `equipped` flags.
- **Monitors:** Keep the two ten-box tracks, but label overflow against **natural Body** and its lethal threshold rather than an unspecified “Body” value; the system’s [overflow rule](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-foundryvtt/module/rules/healing-clock-rules.mjs:34) uses natural Body.
- **Karma Pool:** `startingKarmaPool` gives the correct new-character starting value, but the sheet should use [capacity and available pool](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/content/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:3543) when those fields exist, so spent, burned, drawn, and awarded Karma are represented correctly.
- **Derived parity:** The proposed hand-entered pregen comparison is too weak for [PLAN-M2’s parity requirement](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN-M2.md:174); extract the needed pure CharacterData composition into the system release and compare exported Foundry values before printing those derived fields.
- **Attacks:** “As the system stores them” misses prepared weapon damage such as bows; call [strengthMinWeaponStats](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/content/sr2e-foundryvtt/module/rules/sr2e-rules.mjs:2815) for source items and test the resulting damage code.
- **Renderer:** PDFKit is compatible with a shell-free image and supports embedded fonts and text measurement, but the plan must copy font files and licences into the runtime image and verify the selected font’s actual redistribution terms. [PDFKit documentation](https://pdfkit.org/docs/text.html), [Braille Institute font page](https://www.brailleinstitute.org/freefont/).
- **Process limits:** [Dockerfile](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docker/Dockerfile:25) has no shell or `ulimit`; specify an enforceable per-render memory/CPU mechanism, global queue, wall-clock kill, output cap, and cleanup, since Node’s child-process API does not itself provide those OS limits. [Node child-process documentation](https://nodejs.org/api/child_process.html).
- **Fit test:** Renderer-reported runs alone can miss invisible or clipped PDF output; extract text and inspect rendered pages, then test the actual maximum item count, long notes, unbreakable Unicode text, fallback glyphs, both paper sizes, and every bundled font against the approved [fit rule](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN.md:313).
- **Untrusted text and DoS:** Define plain-text handling for notes, controls, bidi text, and links; enforce page and byte caps before streaming, and rate-limit the authenticated GET route across users as well as per user, returning an explicit failure instead of a partial PDF.
- **Simpler path:** Reuse the system’s pure rule helpers and one plain sheet model; defer the custom column-flow engine until a fixed Classic page plus continuation pages proves insufficient.

VERDICT: REVISE
### Claude's response
Accepted 12 (draft 2). #7 answered differently: the approved roadmap keeps the app's own derivation for creation characters with a parity test as the control (not the parked system-wide extraction), but the parity test moves into this slice and uses Foundry's real prepared values exported from the local test world.

## Round 2 — Codex gpt-6-sol high
- **Parity input:** Draft 2 says `derive(source)` can use a Foundry actor source directly, but the app’s character body also contains `creation` data that `validate` reads; define a fixture adapter that supplies the same body and creation options before comparing prepared values.
- **Render isolation:** A Worker with `resourceLimits` does not meet the approved plan’s separate child process and OS-enforced memory limit; run PDFKit in a killable child process with enforceable limits.
- **Font coverage:** The plan tests non-Latin text but names no embedded fallback for missing glyphs; bundle fallback fonts and select them per glyph so accepted text remains printable.
- **Fit verification:** Extracted text and page bounds can pass while text is clipped or overprinted; inspect rendered pages and keep the visual snapshots required by the approved fit rule.
- **Readable font:** The sheet plan says U22 applies unchanged, but its standard and readable font choices are not distinctly specified and the site still uses a system-font placeholder; name both font sets and include the site setting in this slice.

VERDICT: REVISE
### Claude's response
All five accepted (draft 3). Plan review stops here; the code review checks round 2's fixes.
