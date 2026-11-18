# Plan: character portraits (upload, store, show, print)
_Draft 3 (2026-11-18), after Codex plan rounds 1–2 (11 + 3 findings; docs/PLAN-portrait-REVIEW-LOG.md). The "Draft 2"
and "Draft 3" sections at the end win over the text above them; round 2's fixes are checked by the code review. Under the approved rules in docs/PLAN.md "Security" (portrait upload: size/type caps, a
decoded-pixel limit, re-encoded by sharp to WebP with metadata stripped, in the bounded killable subprocess queue,
never SVG, served only to the owner) and "Backups" (the database AND the uploaded assets, as one set)._

## Goal
A player uploads a portrait for a character; the Character page shows it; the Fohawk sheet prints it in its header
(and the Classic sheet beside the title). Nothing else changes.

## 1. Upload
- `PUT /api/documents/:id/portrait` with the raw image as the body (`Content-Type: image/jpeg | image/png |
  image/webp`; anything else 415), body limit 8 MB, characters only, the owner only (the library's `ownedDocument`),
  CSRF + origin like every write, an Idempotency-Key, and the revision the client read (`?revision=n`) — the write is
  conditional like every other.
- Rate-limited per user (10 a minute) and admitted through the SAME queue as sheet rendering (one at a time
  server-wide, a short line, else 503 busy).

## 2. Processing (in the child process, sharp)
- `sharp(input, { limitInputPixels: 25_000_000, failOn: "error", sequentialRead: true })`; `sharp.cache(false)`,
  `sharp.concurrency(1)`; the child's heap limit and wall-clock kill as for PDFs.
- Only JPEG, PNG and WebP decoders are accepted: the input's detected format (sharp's `metadata().format`) must be one
  of them, whatever the Content-Type claimed; animated images are refused (`pages > 1`).
- Auto-orient (EXIF rotation applied), then resize to fit 1024 × 1024 (never enlarged), sRGB.
- Output TWO re-encoded images, both with ALL metadata stripped (sharp writes none unless asked): WebP quality 82 (the
  page) and JPEG quality 85 (the PDF: pdfkit embeds JPEG/PNG, not WebP). Each output capped at 1 MB (else refused).

## 3. Storage: in the database
- New table `assets` (migration `003-assets`): `id` (uuid), `owner_id` (users, cascade), `document_id` (documents,
  cascade), `kind` ("portrait"), `webp` and `jpeg` (binary: SQLite BLOB, Postgres bytea, MySQL LONGBLOB), `bytes`,
  `sha256`, `created_at`.
- Why the database, not files: one backup set by construction (PLAN.md's rule), the same four databases, the same
  owner checks, the user's byte quota (`charge` adds the asset's bytes; deleting frees them).
- The character body records `creation.portrait = { assetId }` (set by the upload route inside the SAME conditional
  write that inserts the asset — one new revision). `actor.img` is not touched (Foundry paths are the connector's job,
  milestone 7).
- **Lifetime**: a document keeps at most 5 portrait assets; on a new upload the oldest beyond 5 is deleted (its bytes
  freed). A revision that points at a deleted asset shows no portrait (and says so). Purging a document deletes its
  assets (cascade) and frees their bytes in the same transaction as the document's.
- `DELETE /api/documents/:id/portrait?revision=n` clears `creation.portrait` (a new revision); the asset stays within
  the 5 (so undo by restoring a revision works).

## 4. Serving
- `GET /api/documents/:id/portrait[?revision=n]` → the WebP of the current (or that revision's) portrait;
  owner only; `Cache-Control: private, no-store`; `Content-Type: image/webp`; `X-Content-Type-Options: nosniff`;
  `Content-Disposition: inline`. CSP `img-src 'self'` already allows it.

## 5. Sheets
- The render job gets the JPEG bytes (read by the server, passed to the child). Fohawk: a square at the left of the
  header band (the title moves right); Classic: a 72 pt square at the top right, the header text beside it. The fit
  test gains a fixture with a portrait, and asserts the image's box is inside the safe area and overlaps no text.
- The Markdown stat block and the table card do not include it.

## 6. Client
Character page, Concept step: the portrait (or a "No portrait" box), "Upload portrait" (file input, accepts the
three types, size checked before sending), "Remove". Errors say why (too big, wrong type, busy).

## Tests
Processing: a JPEG with EXIF GPS → the stored images have no EXIF/XMP/ICC text; a PNG bomb (huge dimensions, tiny
file) refused by the pixel limit; an SVG and a GIF refused whatever the Content-Type; an animated WebP refused;
rotation applied. Routes: owner only, other user 404, CSRF, wrong revision 409, quota charged and freed, replace keeps
5, purge frees. Sheets: the fit test with a portrait in both styles.

## Dependencies
`sharp` (Apache-2.0; libvips prebuilt for linux-x64 glibc, as in the distroless image — no install scripts needed),
pinned, and the Docker build verified.

## Draft 2 — changes after round 1 (these win)
- **One stored encoding** (r1 #11): only the sanitized WebP is stored; the render job makes the PDF's JPEG from it with
  sharp inside the same bounded child. `bytes` = the WebP's length (r1 #6).
- **Before sharp sees a byte** (r1 #1, #2): our own code checks the magic signature (JPEG `FF D8 FF`, PNG
  `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF....WEBP`), that it matches the declared Content-Type, and reads the width
  and height from the header (PNG IHDR, JPEG SOFn, WebP VP8/VP8L/VP8X) — both ≤ 4096 and the product ≤ 16,777,216,
  else refused. Then sharp runs with `limitInputPixels: 16_777_216`, `limitInputPixels` and the header check
  agreeing; sharp's detected format must equal the signature's. No other loader is reachable.
- **Memory** (r1 #2): the child's V8 limit does not bound libvips, and the shell-less image has no `ulimit`; the OS
  bound is the CONTAINER's memory limit — docs/OPERATIONS.md's compose example sets `mem_limit` (and the sheet
  queue keeps one job at a time). Tests feed decompression bombs (a 1 × 1 MB-header PNG claiming 60,000 × 60,000; a
  JPEG with a huge SOF) and assert refusal before sharp.
- **Parser** (r1 #3): a route-scoped content-type parser for the three image types (`parseAs: "buffer"`, 8 MB),
  registered inside the portrait route's plugin only; an empty body is 400.
- **Idempotency** (r1 #4): the fingerprint is `PUT /documents/:id/portrait` + revision + MIME type + SHA-256 of the
  whole upload; the revision is re-checked inside the write transaction (the existing conditional `bump`).
- **Asset lookups** (r1 #5): image bytes are read only by `assets.id = ? AND document_id = ? AND owner_id = ?` for the
  already-authorized document; a mismatch is the same 404 as a missing asset.
- **Quota and retention** (r1 #6): `charge(+bytes)` once when the asset is inserted; the 5-asset eviction deletes the
  oldest rows in the same transaction and `charge(-their bytes)` only for rows actually deleted (the delete's own
  result). Revisions don't charge again for the image.
- **Purge race — an existing bug** (r1 #7): `purge` deletes a document selected as old-and-deleted without rechecking;
  a restore landing between could be purged. Fix in this slice: delete `WHERE id = ? AND deleted_at <= cutoff`, and
  adjust counters only when that delete removed the row (assets cascade with it, their bytes freed in the same
  transaction).
- **Binary columns** (r1 #8): `003-assets` uses BLOB / bytea / LONGBLOB per dialect; reads normalize to `Buffer`
  (`Buffer.from(...)`); CI's four databases run a round-trip test with a ~1 MB value, and the migration is
  restartable (conditional create).
- **Backups and metadata** (r1 #9): backups are milestone 6 (not built yet); the stored `sha256` per asset is what
  its checksum manifest will use. The metadata test reads the outputs' `metadata()` and asserts no `exif`, `xmp`,
  `icc`, `iptc`.
- **Container** (r1 #10): sharp pinned; the lockfile must list `@img/sharp-linux-x64` and `@img/sharp-libvips-linux-x64`
  (a CI check); the Docker job runs a real conversion inside the FINAL image (`docker run … node -e` a 1-pixel PNG →
  WebP). Only linux-x64 is supported for now (stated in OPERATIONS.md).

## Draft 3 — changes after round 2 (these win)
- **Memory, measured** (r2 #1): Node gives a child process no OS memory limit, and the shell-less image has no
  `prlimit`/`ulimit`; a per-process OS limit is not available. The bound is therefore the pixel cap itself: our
  header check AND sharp's `limitInputPixels` (which re-checks the dimensions sharp actually decodes) both hold an
  image to 16,777,216 pixels, so libvips's working set is bounded (`sharp.cache(false)`, `concurrency(1)`,
  `sequentialRead`). A test decodes an image AT the cap (4096 × 4096, noise, so it can't compress away) in the child
  and asserts its peak resident memory (`process.resourceUsage().maxRSS`) stays under 512 MB; the compose example's
  container `mem_limit` (1 GB) is the outer bound. Recorded as a decision, open to revisit if a per-process limit
  becomes available.
- **Purge order** (r2 #2): the conditional document delete runs FIRST (`WHERE id AND deleted_at <= cutoff`); the
  revisions and assets go by the foreign keys' cascade (both declared `on delete cascade`), and the byte counter is
  lowered by the sum read under the same transaction only when the document row was deleted.
- **Copy and restore tests** (r2 #3): cross-database copy and backup/restore don't exist yet (milestone 6). Their
  plans must include the assets table (bytes and `sha256` compared); noted in docs/ROADMAP.md item 6.

## Premade portraits (2026-11-18, the user's request)
The system's pregen portraits (`assets/pregen_portraits/*.webp`) join the project's content copy (the sync copies
them from the SYSTEM pin, same provenance check; tools/content.mjs `STOCK_PORTRAITS`). `GET /api/catalog/portraits`
lists them, `GET /api/catalog/portraits/:id` serves one (signed-in users; the id must be one listed at start — never
a path); `POST /api/documents/:id/portrait/stock { revision, stock }` sets `creation.portrait = { stock }` in one
conditional write (nothing stored, no quota). `getPortrait` returns the premade file for such a character, so the
page and the sheets show it like an upload. The Docker image ships the folder.
