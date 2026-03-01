/**
 * Receipt upload security: allowlist extensions, magic-byte validation, no trust of Content-Type.
 * OWASP: allowlist extensions, validate file signature, max size server-side, random filename, store original name in DB.
 */

export const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"] as const;
export const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const RATE_LIMIT_UPLOADS_PER_HOUR = 20;

const MAGIC: Array<{ ext: string; check: (buf: Buffer) => boolean }> = [
  { ext: ".pdf", check: (buf) => buf.length >= 5 && buf.slice(0, 5).toString("ascii") === "%PDF-" },
  { ext: ".jpg", check: (buf) => buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8 },
  { ext: ".jpeg", check: (buf) => buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8 },
  {
    ext: ".png",
    check: (buf) =>
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a,
  },
  {
    ext: ".webp",
    check: (buf) =>
      buf.length >= 12 &&
      buf.slice(0, 4).toString("ascii") === "RIFF" &&
      buf.slice(8, 12).toString("ascii") === "WEBP",
  },
];

/** Returns allowed extension from magic bytes, or null if not allowed. */
export function getAllowedExtensionFromMagic(buffer: Buffer): string | null {
  for (const { ext, check } of MAGIC) {
    if (check(buffer)) return ext;
  }
  return null;
}

/** Normalize file extension to lowercase; must be in allowlist. */
export function getAllowedExtensionFromName(filename: string): string | null {
  const ext = filename.toLowerCase().replace(/^.*\./, "");
  const withDot = ext ? `.${ext}` : "";
  return ALLOWED_EXTENSIONS.includes(withDot as (typeof ALLOWED_EXTENSIONS)[number]) ? withDot : null;
}

/**
 * Validate receipt file: size, then magic bytes. Do not trust Content-Type or user filename for path.
 * Returns { allowed: true, safeExt: ".pdf" } or { allowed: false, error: "..." }.
 */
export function validateReceiptFile(buffer: Buffer): { allowed: true; safeExt: string } | { allowed: false; error: string } {
  if (buffer.length > MAX_SIZE_BYTES) {
    return { allowed: false, error: `File too large (max ${MAX_SIZE_BYTES / 1024 / 1024}MB)` };
  }
  const safeExt = getAllowedExtensionFromMagic(buffer);
  if (!safeExt) {
    return { allowed: false, error: "Invalid file signature (allowed: PDF, JPEG, PNG, WebP)" };
  }
  return { allowed: true, safeExt };
}
