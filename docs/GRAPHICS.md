# Graphics plan (Codex consult, 2026-11-13)

Codex (read-only consult, given docs/PLAN.md and the Pink Fohawk sheet for Mel) proposed the graphics for the site and
the sheets. Its answer is below, unedited. Claude's notes on what we adopt come first.

## What we adopt (Claude)

- **Split of work:** Codex's image generator makes portraits, character art and one atmospheric landing plate; logos,
  icons, section bars, pixel tiles, loading/empty states and everything on a sheet are hand-built SVG/CSS. Agreed.
- **Sheets:** vector only, no textures or banter, the portrait the only raster. Fohawk prints on white by default
  (not the reference's grey), ink-saver outlines the black bars, magenta is an accent whose meaning also shows in
  weight/position. **Body text targets 9–10 pt**; the plan's 8 / 6.5 pt are emergency floors only (PLAN.md U18
  updated to say so).
- **Themes:** the four palettes are a starting point; every text/control pairing is contrast-tested in context
  before shipping. GeoCities stays exuberant but with no blinking or animated backgrounds.
- **Shadowland handles:** abstract SVG badges first (readable at 32 px), not generated faces.
- **Consistency:** one approved pilot portrait + a five-image contact sheet before scaling; an asset manifest
  (`assets/MANIFEST.json`: role, size, bytes, prompt, references, approved version, crop rules, theme behaviour).
- **Privacy:** a generic OG/social card; no character names or portraits in public preview metadata.
- **Mel's portrait** is our own generated art, so it can serve as a rendering reference.
- **Timing:** no images are generated now. The pilot and contact sheet are made in M3/M9 (Codex usage is limited),
  and the metatype set follows the core book's five metatypes; Companion metavariants come with M7.

---

## Codex's answer

I’d build **one original visual identity, four site treatments, and a separate print system**. Keep the street voice exuberant; keep navigation, numbers, and printed sheets disciplined.

This follows [docs/PLAN.md](/Users/jcandalino/Code/foundryvtt/shadowrun/sr2e-chargen/docs/PLAN.md), including its export, accessibility, and security requirements. No files were changed or images generated.

**1. Site graphics**

Use a shared visual vocabulary: clipped corners, square connection points, bracket pairs, and small registration ticks. Avoid dragon emblems, skull-and-scroll compositions, and lettering that resembles the Shadowrun logo. “Hoi chummer!” can be the greeting without committing it as the product name.

Sizes below are delivery targets, not promises about raw generation output.

| Group | Purpose and proposed assets | Medium / maker | Size and format | Theme variants |
|---|---|---|---|---|
| Brand / wordmark | Original typeset product name; small “open connection” mark made from offset brackets and a square | Hand-built SVG; live text where practical | Responsive SVG; horizontal and compact lockups | Same geometry; light, dark, and monochrome colors |
| Favicon / app icon | Recognizable bracket mark without tiny lettering | Hand-built SVG and raster exports | SVG favicon; 32px PNG fallback; 180px touch icon; 192/512px app icons | Fixed high-contrast tile, independent of page theme |
| Backgrounds / textures | Atmosphere around the work area | Primarily CSS/SVG; imagegen only for an optional atmospheric banner | Small repeatable vector patterns; optional 1536×1024 source delivered at 1280/640px WebP | Terminal grid; cyberpunk routing lines; cybernoir architectural shadows; GeoCities pixel tiles |
| Build-flow icons | Start, priorities, metatype, magic, attributes, skills, qualities, resources, finish | Hand-built SVG | 24×24 viewBox; 20–24px display; approximately 2px strokes | Same silhouettes; token-based colors. Optional pixel-rendered set later |
| Resource / manager icons | Ware, weapons, armor, gear, vehicles, decks, contacts, lifestyle; wounds, Karma, money, history | Hand-built SVG | Same icon grid; 16px variants simplified manually | Shared across themes |
| Metatype art | Give selection cards personality without implying a required profession or temperament | Imagegen illustrations | 1024² WebP masters; 256/512px derivatives | Same art across themes; theme-specific framing, not four regenerations |
| Archetype art | Make starting builds identifiable through clothing, posture, and equipment | Imagegen illustrations | 1024² WebP masters; 256/512px cards | Shared art and crop rules; neutral lighting with restrained accents |
| Shadowland handle avatars | Identify recurring original speakers quickly | Hand-built SVG abstract badges initially; optional imagegen portraits for a few recurring personalities | SVG badges; portraits 256² WebP displayed at 32–48px | Badges recolor; portraits retain identity |
| Empty / error states | Explain what happened and identify the next action | Hand-built SVG/CSS: empty dossier, disconnected plug, missing route | 96–160px illustrations; compact SVG | Same illustration, theme colors and framing |
| Loading states | Indicate work without distracting from the builder | CSS progress bar, bracket pulse, static skeleton | No raster animation | Terminal cursor; cyberpunk segments; noir thin line; retro blocks |
| Social / OG card | Identify the app when its landing URL is pasted | Hand-built composition; optional generated background | 1200×630 PNG or JPEG, target under 200KB | One canonical brand card; theme variants only if useful |

Suggested build icons: folder, ranked bars, person outline, radiating spark, six-cell grid, linked nodes, split diamond, equipment case, checked dossier. Pair each with a visible label; metatype should not be represented by one particular species’ face.

Empty-state copy can carry the voice: **“No runners on file. Build your first character.”** Error copy should identify the actual problem before adding flavor. Banter avatars and commentary stay in the builder, as U11 requires.

Imagegen is well suited to **individual portraits, character illustrations, believable clothing and materials, atmospheric architecture, and visual exploration**. I would hand-build logos, icons, pixel tiles, loading states, sheet ornament, and all text. Generated art should never be the source of rules information.

**2. Sheet graphics**

The attached Fohawk sheet already has a strong hierarchy: portrait and handle, large attributes, clear section bars, then detail. Preserve that hierarchy, while making its dimensions responsive to actual content.

| Element | Classic | Fohawk | Future theme sheets | Production requirement |
|---|---|---|---|---|
| Header | Compact identification fields and priority summary; original typography | Portrait, handle, optional a.k.a., priorities; clipped corner | Theme expressed through typography and a small motif | Vector text and geometry |
| Section bars | Plain ruled or outlined headings | Black angled bars; outlined equivalent in ink-saver | Terminal brackets, noir rules, retro stepped corners | Vector; dynamically sized |
| Frames | Functional field boxes | Mostly open columns; restrained corner cuts | Sparse, theme-specific corners | Vector; never constrain text to a fixed decorative height |
| Dividers | Clear horizontal rules | Thin neutral rules matching the reference | Same structural positions | Vector, usually 0.5–0.75pt |
| Icons | Optional, small, always labeled | Same shared icon set | Same meaning and silhouette | Vector; no raster badges |
| Portrait frame | Optional compact rectangle | Square header frame with a clipped outer surround | Simple alternate outline | Vector frame; raster portrait only |
| Condition monitors | Clear empty boxes and severity labels | Preserve the reference’s strong outline hierarchy | Same usable box geometry | Vector; approximately 4.5–5mm boxes as a starting target |
| Texture | None | None behind content | At most sparse vector marks in unused header space | No raster textures; no full-page tint |
| Continuation / footer | Handle, page number, continued-section labels | Same, with restrained accent | Same information in every style | Vector text; useful before decorative |

“Classic” should reproduce the **functional organization**, using independently drawn fields and original typography—not a scan, traced artwork, or copied ornamental lettering.

For Fohawk specifically:

- Change the reference’s pale gray page to white for the default print export.
- Preserve magenta as an optional accent, with boldness and position carrying the same meaning in grayscale.
- Make the large black header and bars outlined in ink-saver; offer portrait omission too.
- Allow long handles, aliases, and section titles to grow vertically.
- Follow the plan’s combat-first page ordering. The reference’s narrative sections should move when skills, attacks, or other table-use information need space.

Target 9–10pt body text where possible. The plan’s 8pt body / 6.5pt label limits are emergency floors, not design targets. Wrap first, then apply the permitted size reduction, then continue onto another page.

Letter and A4 need separate reflow within the required 12.7mm safe margins. Font substitutions, including the readable-font setting, must trigger fresh measurement.

**Keep off every sheet:** Shadowland banter, app error/loading graphics, scanlines, glows, full-page backgrounds, decorative distress over text, tiny reversed labels, giant watermarks, fake handwriting for rules, and rasterized tables. No ornament gets space at the expense of a name, damage code, or pencil mark.

The one-page table card should use the same vector vocabulary and a deliberately smaller information set—not a miniature full character sheet.

**3. Art direction by theme**

These are proposed palette tokens, not a declaration that every possible pairing passes contrast checks. Text, focus, status, and control combinations must be tested in context.

| Theme | Palette | Line / typography treatment | Motifs and reference language |
|---|---|---|---|
| Old-school terminal | Dark `#101712`, text `#E5F2E8`, accent `#9BE58C`; light surface `#F3F7F1`, ink `#17321D`, accent `#245C32` | 1–2px rules; monospace headings and numerical displays; readable body font | Maintenance terminals, patch-panel labels, monochrome printouts, bracketed prompts |
| Cyberpunk | Dark `#11131A`, text `#F4F4F7`, magenta `#FF67B5`, cyan `#64DFEA`; light surface `#FAF8FC`, ink `#201725`, accent `#9E0054` | 2px lines; strong headings; one clipped corner per panel rather than every object | Night transit infrastructure, industrial warning labels, repaired electronics, street-made signage |
| Cybernoir | Dark `#151719`, text `#EEEAE2`, amber `#DDB777`; light surface `#F7F4ED`, ink `#242728`, accent `#705024` | 1px dividers with occasional 2px emphasis; quiet typography and generous spacing | Municipal dossiers, rain-dark windows, architectural shadow, worn brass hardware |
| GeoCities retro | Light `#FFF9E8`, ink `#202030`, blue `#2537A8`, plum `#802078`; dark `#17132B`, text `#FFF4D6`, accent `#C4B5FF` | 2px stepped borders; pixel lettering only for short decorative labels | Handmade personal homepages, tiled stars, directory tabs, small pixel badges, deliberately earnest decoration |

The common identity comes from matching icon silhouettes, spacing, corner geometry, information hierarchy, and portrait treatment. Themes change presentation, never control placement or meaning.

Keep backgrounds outside reading surfaces. Terminal scanlines, if offered at all, belong in an optional decorative margin. GeoCities can be exuberant without blinking text, animated backgrounds, or fake system dialogs.

The readable-font override applies everywhere, including terminal labels and retro headings. Reduced-motion mode should replace animation with an unmistakable static loading state.

**4. First ten raster pieces**

I’d start with five metatype portraits, four archetype portraits, and one environment plate. All nine character images use the same 1024×1024 composition and produce WebP delivery assets. This establishes a coherent collection before expanding into dozens of portraits.

For the requested `-i` references, the inputs below describe **reference roles**, not commands to run now. The installed skill’s CLI documents repeated `--image` flags; normal generation uses the built-in tool.

Prepare these original reference assets first:

- **R1 — visual specification board:** hand-built palette swatches, lighting diagram, sample crop, clothing/material notes. No borrowed character art.
- **R2 — composition guide:** square canvas, head/horn safe area, eye line, shoulder crop, optional circular-token safe area.
- **R3 — approved pilot portrait:** selected from piece 1, then reused as a style reference for pieces 2–9.
- **R4 — environment blockout:** simple original sketch showing architecture and empty space for the landing page.
- **Mel reference:** the attached sheet may inform palette and header compatibility. Use its original portrait source, if available and cleared for reuse, when seeking that portrait’s rendering treatment; the full sheet is a poor anatomy reference.

Use this shared prefix for pieces 1–9:

> Original near-future urban-fantasy character illustration for a private character-builder app. Square 1024×1024 composition, one adult subject, chest-up, eye-level camera, complete head and distinctive anatomy inside a generous safe margin. Restrained painterly realism, broad readable shapes, believable worn fabric and metal, soft neutral key light, subtle magenta reflected light, plain warm-gray background with clear silhouette separation. Match the reference board’s rendering and crop, not the reference person’s identity. Clear face at thumbnail size. No text, logos, lettering, watermark, franchise costume, or recognizable published character.

Append these individual prompts:

| # | Piece and concrete prompt suffix | Reference inputs |
|---|---|---|
| 1 | **Human pilot portrait:** “An adult human woman in her forties with dark skin, short natural hair, a repaired everyday commuter jacket, and an observant, relaxed expression. No visible weapon or profession-specific equipment. Ordinary practical clothing with individual character.” | R1 + R2; optional cleared Mel portrait for rendering treatment only |
| 2 | **Elf metatype:** “An adult elf with long pointed ears, a long narrow face, silver-black hair tied back, and a sturdy patched work coat. Calm, direct expression. Ears fully visible; no aristocratic costume, magical aura, or beauty-advertisement styling.” | R1 + R2 + R3 |
| 3 | **Dwarf metatype:** “An adult dwarf woman with a broad face, compact neck, broad shoulders, tightly braided hair, and a practical canvas jacket. Friendly, appraising expression. Keep the same camera distance and visual dignity as the other portraits; no medieval costume.” | R1 + R2 + R3 |
| 4 | **Ork metatype:** “An adult ork man with a broad jaw, modest lower tusks, textured skin, closely cropped hair, and a neatly repaired civilian coat. Thoughtful, patient expression. Tusks must read clearly without becoming a caricature; no aggressive pose.” | R1 + R2 + R3 |
| 5 | **Troll metatype:** “An adult troll woman with broad facial proportions, asymmetrical swept horns, small tusks, and subtle natural dermal texture. A practical high-collared jacket and an amused, attentive expression. Keep both horns entirely within frame. No monster snarl or oversized weapon.” | R1 + R2 + R3 |
| 6 | **Street samurai archetype:** “An adult elf with a close haircut, a plain protective jacket, a visible restrained cybernetic forearm, and a disciplined expression. Hands rest naturally below chest level; equipment is practical and unbranded. Communicate readiness through posture, without a combat pose.” | R1 + R2 + R3 |
| 7 | **Decker archetype:** “An adult dwarf with a compact homemade keyboard terminal resting against the lower chest, coiled physical cable, practical fingerless gloves, and an alert half-smile. Terminal screen faces away from camera. Tactile repaired electronics; no floating interface or readable display.” | R1 + R2 + R3 |
| 8 | **Mage archetype:** “An adult ork in a plain city coat, one hand visible at chest height shaping a small abstract geometric light. Composed expression; subtle illumination, no explosive effects. Invented geometric magic only, no borrowed religious or cultural regalia.” | R1 + R2 + R3 |
| 9 | **Rigger archetype:** “An adult human woman with tied-back gray hair, worn utility clothing, and a small unbranded wheeled inspection drone perched on her forearm. A practical controller hangs from a shoulder strap. Patient technician’s expression; believable mechanical proportions.” | R1 + R2 + R3 |
| 10 | **Landing environment:** “Original near-future urban-fantasy environment, landscape 1536×1024. A sheltered neighborhood communications kiosk at night, patched metal panels, bundled cables, damp concrete, restrained magenta and warm-white practical lights. Architecture concentrated in the right half; left half quiet and low-detail for a separate HTML text panel. Painterly realism matching the portrait collection. No people, readable signs, logos, skyline landmarks, holographic text, or franchise motifs.” | R1 + R4 + R3 for rendering treatment only |

The metatype examples deliberately avoid assigning species to jobs. The archetype set should later expand across metatypes, ages, genders, and body types.

I would not spend early imagegen effort on dozens of tiny Shadowland faces. Original SVG handle badges will be more recognizable at 32px, cheaper to deliver, and easier to keep consistent.

**5. Risks and consistency controls**

| Risk | Practical control |
|---|---|
| Style drift across a large collection | Approve one pilot, then a five-image contact sheet before scaling up. Reuse the same board, crop guide, lighting description, palette, and approved pilot—not the most recent generated image, which can compound drift. |
| False confidence in seeds | Save seeds where a chosen tool exposes them, but do not make seed control a dependency. References, recorded prompts, model/version metadata, and visual review are the working consistency system. |
| Bad small-size readability | Review portraits at 48, 128, and 256px. Remove busy backgrounds and small glowing details. Review icons at actual display size, not enlarged. |
| Print failures | Inspect grayscale and real home-printer output. Test long content in every style × paper size × font, including ink-saver. Never flatten the finished sheet into a raster image. |
| Trademark / licence mistakes | Use original reference boards and cleared user assets. Avoid publisher art, logo silhouettes, distinctive lettering, branded props, and artist/franchise imitation prompts. Record asset provenance and bundled font licences; review outputs for accidental familiar marks. Generation alone is not proof of clearance. |
| File weight | Target portraits at roughly 100–250KB for 1024px and 20–60KB for 256px, adjusting after visual inspection. Load thumbnails in lists, lazy-load offscreen art, and keep background decoration primarily CSS. Avoid separate full-resolution artwork for every theme. |
| Accessibility lost to atmosphere | Keep illustrations decorative unless they add information; provide useful descriptions when they do. Pair icons and statuses with text. Test palette pairings, keyboard focus, reduced motion, and the font override. |
| Private data leaking through graphics | Use a generic OG card. Never include character names, portraits, account details, or invite tokens in public preview metadata. |
| Unsafe asset handling | Follow the plan: uploads are raster-only, capped, re-encoded, and stripped of metadata; no user SVG. Hand-built SVG assets are trusted project files. Escape sheet text and render with external resources disabled. Bundle assets locally rather than fetching remote fonts or image URLs during export. |

Keep an asset manifest with each file’s role, dimensions, byte size, reference provenance, prompt, approved version, crop rules, and theme behavior. Store the approved contact sheet beside it. That gives future additions a concrete standard to match.

VERDICT: DONE.