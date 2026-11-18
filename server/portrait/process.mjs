/**
 * Re-encoding (docs/PLAN-portrait.md): run ONLY in the sheet child process. The input has passed checkUpload; sharp
 * re-checks the decoded dimensions (limitInputPixels), applies the EXIF rotation, fits 1024 × 1024 (never enlarged),
 * and writes a WebP with NO metadata (sharp writes none unless asked).
 */
import sharp from "sharp";
import { createHash } from "node:crypto";
import { checkUpload, PortraitError, MAX_PIXELS } from "./check.mjs";

sharp.cache(false);
sharp.concurrency(1);
export const MAX_OUTPUT = 1024 * 1024;

export async function processPortrait(buffer, contentType) {
  const first = checkUpload(buffer, contentType);
  const img = sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: "error", sequentialRead: true, animated: false });
  const meta = await img.metadata();
  if (meta.format !== first.format) throw new PortraitError("That file isn't the kind of image it says it is.", 415, "portrait-type");
  if ((meta.pages ?? 1) > 1) throw new PortraitError("Animated images can't be portraits.");
  const webp = await img.rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).toColourspace("srgb").webp({ quality: 82 }).toBuffer();
  if (webp.length > MAX_OUTPUT) throw new PortraitError("That image is too detailed to store (over 1 MB after conversion).");
  return { webp, sha256: createHash("sha256").update(webp).digest("hex") };
}
/** The PDF's copy: JPEG from the stored WebP (pdfkit embeds JPEG/PNG, not WebP). */
export const portraitJpeg = (webp) => sharp(webp, { limitInputPixels: MAX_PIXELS, failOn: "error" }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
