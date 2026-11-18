/**
 * The upload's first gate (docs/PLAN-portrait.md, draft 2): BEFORE any decoder sees a byte, our own code checks the
 * magic signature, that it matches the declared type, and reads the dimensions from the header — both ≤ 4096 and the
 * product ≤ 16,777,216 — so a decompression bomb is refused without decoding. Pure; throws a PortraitError.
 */
export class PortraitError extends Error {
  constructor(message, status = 422, code = "portrait-refused") { super(message); this.status = status; this.code = code; }
}
export const MAX_SIDE = 4096, MAX_PIXELS = 16_777_216, MAX_UPLOAD = 8 * 1024 * 1024;
export const TYPES = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };

const u16be = (b, o) => b.readUInt16BE(o), u24le = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
export function signatureOf(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  return null;
}
/** The dimensions the header declares, or null when they can't be read (refused: we never guess). */
export function dimensionsOf(b, format) {
  try {
    if (format === "png") return b.toString("latin1", 12, 16) === "IHDR" ? { width: b.readUInt32BE(16), height: b.readUInt32BE(20) } : null;
    if (format === "jpeg") {
      let o = 2;
      while (o + 4 <= b.length) {
        if (b[o] !== 0xff) return null;
        const marker = b[o + 1];
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { o += 2; continue; }
        const len = u16be(b, o + 2);
        // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC), carry the frame size.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: u16be(b, o + 5), width: u16be(b, o + 7) };
        if (marker === 0xda || len < 2) return null;   // scan data before any frame header: refuse
        o += 2 + len;
      }
      return null;
    }
    if (format === "webp") {
      const chunk = b.toString("latin1", 12, 16);
      if (chunk === "VP8X") return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1, animated: !!(b[20] & 0x02) };
      if (chunk === "VP8L") { const v = b.readUInt32LE(21); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; }
      if (chunk === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      return null;
    }
  } catch { return null; }
  return null;
}
/** The whole first gate. Returns { format, width, height }. */
export function checkUpload(buffer, contentType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new PortraitError("No image was sent.", 400, "portrait-empty");
  if (buffer.length > MAX_UPLOAD) throw new PortraitError("That image is over 8 MB.", 413, "portrait-too-big");
  const declared = TYPES[String(contentType ?? "").split(";")[0].trim().toLowerCase()];
  if (!declared) throw new PortraitError("A portrait is a JPEG, PNG or WebP image.", 415, "portrait-type");
  const format = signatureOf(buffer);
  if (format !== declared) throw new PortraitError("That file isn't the kind of image it says it is.", 415, "portrait-type");
  const d = dimensionsOf(buffer, format);
  if (!d || !(d.width > 0) || !(d.height > 0)) throw new PortraitError("That image's size can't be read.");
  if (d.animated) throw new PortraitError("Animated images can't be portraits.");
  if (d.width > MAX_SIDE || d.height > MAX_SIDE || d.width * d.height > MAX_PIXELS) throw new PortraitError(`That image is ${d.width} × ${d.height}; the most is ${MAX_SIDE} × ${MAX_SIDE}.`);
  return { format, width: d.width, height: d.height };
}
