/**
 * Chat attachment: allowlist MIME (PDF, JPEG, PNG, WebP), magic bytes, max 20MB.
 */
export const CHAT_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024; // 20MB

export const CHAT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
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
  {
    mime: "image/webp",
    check: (buf) =>
      buf.length >= 12 &&
      buf.slice(0, 4).toString("ascii") === "RIFF" &&
      buf.slice(8, 12).toString("ascii") === "WEBP",
  },
];

function detectMimeFromMagic(buffer: Buffer): string | null {
  for (const { mime, check } of MAGIC) {
    if (check(buffer)) return mime;
  }
  return null;
}

export function validateChatAttachment(
  buffer: Buffer,
  declaredMime: string,
  declaredSize: number
): { allowed: true; detectedMime: string } | { allowed: false; error: string } {
  if (buffer.length > CHAT_ATTACHMENT_MAX_BYTES) {
    return {
      allowed: false,
      error: `File too large (max ${CHAT_ATTACHMENT_MAX_BYTES / 1024 / 1024}MB)`,
    };
  }
  if (buffer.length !== declaredSize) {
    return { allowed: false, error: "File size mismatch" };
  }
  const detectedMime = detectMimeFromMagic(buffer);
  if (!detectedMime) {
    return {
      allowed: false,
      error: "Invalid file signature (allowed: PDF, JPEG, PNG, WebP)",
    };
  }
  if (!CHAT_ALLOWED_MIME_TYPES.includes(detectedMime as (typeof CHAT_ALLOWED_MIME_TYPES)[number])) {
    return {
      allowed: false,
      error: "File type not allowed",
    };
  }
  if (
    declaredMime &&
    !CHAT_ALLOWED_MIME_TYPES.includes(declaredMime as (typeof CHAT_ALLOWED_MIME_TYPES)[number])
  ) {
    return {
      allowed: false,
      error: `MIME type not allowed: ${declaredMime}`,
    };
  }
  return { allowed: true, detectedMime };
}
