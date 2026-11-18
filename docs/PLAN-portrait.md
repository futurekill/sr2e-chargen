# Plan: character portraits (upload, store, show, print)
_Draft 1 (2026-11-18). Under the approved rules in docs/PLAN.md "Security" (portrait upload: size/type caps, a
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
