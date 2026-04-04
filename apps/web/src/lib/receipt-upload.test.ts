/**
 * Unit test for receipt upload: extension allowlist and magic-byte validation.
 * Run with: npx tsx src/lib/receipt-upload.test.ts
 */
import {
  getAllowedExtensionFromMagic,
  getAllowedExtensionFromName,
  validateReceiptFile,
  ALLOWED_EXTENSIONS,
} from "./receipt-upload";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// PDF magic: %PDF-
const pdfBuffer = Buffer.from("%PDF-1.4\n%fake", "ascii");
assert(getAllowedExtensionFromMagic(pdfBuffer) === ".pdf", "PDF magic");

// JPEG magic: FFD8 FF
const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
assert(getAllowedExtensionFromMagic(jpegBuffer) === ".jpg", "JPEG magic");

// PNG magic
const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
assert(getAllowedExtensionFromMagic(pngBuffer) === ".png", "PNG magic");

// WebP: RIFF....WEBP
const webpBuffer = Buffer.alloc(12);
webpBuffer.write("RIFF", 0);
webpBuffer.write("WEBP", 8);
assert(getAllowedExtensionFromMagic(webpBuffer) === ".webp", "WebP magic");

// Reject unknown magic
assert(getAllowedExtensionFromMagic(Buffer.from("GIF89a")) === null, "Reject GIF");
assert(getAllowedExtensionFromMagic(Buffer.from("x")) === null, "Reject random");

// Extension allowlist from filename
assert(getAllowedExtensionFromName("a.PDF") === ".pdf", "Extension .pdf");
assert(getAllowedExtensionFromName("b.JPEG") === ".jpeg", "Extension .jpeg");
assert(getAllowedExtensionFromName("c.png") === ".png", "Extension .png");
assert(getAllowedExtensionFromName("d.WebP") === ".webp", "Extension .webp");
assert(getAllowedExtensionFromName("e.exe") === null, "Reject .exe");
assert(getAllowedExtensionFromName("f.pHP") === null, "Reject .php");

// validateReceiptFile
const valid = validateReceiptFile(pdfBuffer);
assert(valid.allowed && valid.safeExt === ".pdf", "validateReceiptFile PDF");
const invalidSig = validateReceiptFile(Buffer.from("not-a-pdf"));
assert(!invalidSig.allowed && invalidSig.error.includes("signature"), "validateReceiptFile invalid signature");
const tooBig = validateReceiptFile(Buffer.alloc(6 * 1024 * 1024));
assert(!tooBig.allowed && tooBig.error.includes("large"), "validateReceiptFile too large");

assert(ALLOWED_EXTENSIONS.includes(".pdf") && ALLOWED_EXTENSIONS.includes(".webp"), "Allowlist");

console.log("All receipt-upload tests passed.");
process.exit(0);
