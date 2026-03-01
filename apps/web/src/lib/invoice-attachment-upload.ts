/**
 * Invoice attachment upload: allowlist MIME (PDF, JPEG, PNG), magic bytes, max 10MB.
 */
export const INVOICE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10MB

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

const MAGIC: Array<{ mime: string; check: (buf: Buffer) => boolean }> = [
  { mime: "application/pdf", check: (buf) => buf.length >= 5 && buf.slice(0, 5).toString("ascii") === "%PDF-" },
  { mime: "image/jpeg", check: (buf) => buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8 },
  {
    mime: "image/png",
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
];

export function detectMimeFromMagic(buffer: Buffer): string | null {
  for (const { mime, check } of MAGIC) {
    if (check(buffer)) return mime;
  }
  return null;
}

export function validateInvoiceAttachment(
  buffer: Buffer,
  declaredMime: string,
  declaredSize: number
): { allowed: true; detectedMime: string } | { allowed: false; error: string } {
  if (buffer.length > INVOICE_ATTACHMENT_MAX_BYTES) {
    return {
      allowed: false,
      error: `File too large (max ${INVOICE_ATTACHMENT_MAX_BYTES / 1024 / 1024}MB)`,
    };
  }
  if (buffer.length !== declaredSize) {
    return { allowed: false, error: "File size mismatch" };
  }
  const detectedMime = detectMimeFromMagic(buffer);
  if (!detectedMime) {
    return {
      allowed: false,
      error: "Invalid file signature (allowed: PDF, JPEG, PNG)",
    };
  }
  if (!ALLOWED_MIME_TYPES.includes(detectedMime as (typeof ALLOWED_MIME_TYPES)[number])) {
    return {
      allowed: false,
      error: "File type not allowed",
    };
  }
  if (declaredMime && !ALLOWED_MIME_TYPES.includes(declaredMime as (typeof ALLOWED_MIME_TYPES)[number])) {
    return {
      allowed: false,
      error: `MIME type not allowed: ${declaredMime}`,
    };
  }
  return { allowed: true, detectedMime };
}
