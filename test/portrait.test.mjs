/** Portraits (docs/PLAN-portrait.md): the header gate before any decoder, and the re-encoding. */
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { checkUpload, signatureOf, PortraitError } from "../server/portrait/check.mjs";
import { processPortrait } from "../server/portrait/process.mjs";

const make = (w, h, fmt, opts = {}) => sharp({ create: { width: w, height: h, channels: 3, background: "#c8006a" } })[fmt](opts).toBuffer();

test("the first gate: signature matches the declared type, dimensions read from the header", async () => {
  for (const [fmt, mime] of [["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"]]) {
    const b = await make(300, 200, fmt);
    assert.deepEqual(checkUpload(b, mime), { format: fmt, width: 300, height: 200 }, fmt);
  }
  const png = await make(10, 10, "png");
  assert.throws(() => checkUpload(png, "image/jpeg"), (e) => e.status === 415, "a PNG declared as JPEG");
  assert.throws(() => checkUpload(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/png"), (e) => e.status === 415, "SVG never");
  assert.throws(() => checkUpload(Buffer.from("GIF89a"), "image/gif"), (e) => e.status === 415, "GIF never");
  assert.throws(() => checkUpload(Buffer.alloc(0), "image/png"), (e) => e.status === 400);
  assert.equal(signatureOf(Buffer.from("RIFF0000WAVE")), null);
});

test("decompression bombs are refused from the header, before decoding", async () => {
  // A real 1x1 PNG with its IHDR rewritten to claim 60,000 × 60,000.
  const png = Buffer.from(await make(1, 1, "png"));
  png.writeUInt32BE(60000, 16); png.writeUInt32BE(60000, 20);
  assert.throws(() => checkUpload(png, "image/png"), /60000 × 60000/);
  const tall = await make(5000, 10, "jpeg");
  assert.throws(() => checkUpload(tall, "image/jpeg"), /4096/);
});

test("re-encoding: WebP, fitted to 1024, rotated, and NO metadata at all", async () => {
  const withExif = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#123456" } })
    .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "secret-gps-owner" } } }).jpeg().toBuffer();
  const before = await sharp(withExif).metadata();
  assert.ok(before.exif, "the input has EXIF");
  const { webp, sha256 } = await processPortrait(withExif, "image/jpeg");
  const m = await sharp(webp).metadata();
  assert.equal(m.format, "webp");
  assert.deepEqual([m.width, m.height], [512, 1024], "orientation 6 applied, then fitted inside 1024");
  for (const k of ["exif", "xmp", "icc", "iptc"]) assert.equal(m[k], undefined, `no ${k}`);
  assert.match(sha256, /^[0-9a-f]{64}$/);
  assert.ok(!webp.includes("secret-gps-owner"));
});

test("an animated WebP is refused (from its header, before decoding)", async () => {
  const mk = (c) => sharp({ create: { width: 8, height: 8, channels: 3, background: c } }).png().toBuffer();
  const anim = await sharp([await mk("#000"), await mk("#fff")], { join: { animated: true } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  assert.equal((await sharp(anim).metadata()).pages, 2, "the fixture really is animated");
  assert.throws(() => checkUpload(anim, "image/webp"), /Animated/);
  await assert.rejects(processPortrait(anim, "image/webp"), PortraitError);
});
