/**
 * Server-only: AES-256-GCM encryption for binary secrets (e.g. Solana keypairs).
 * Uses ENCRYPTION_KEY (64-char hex) if present; else derives from JWT_SECRET in dev only.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

let warnedFallback = false;

function getKey(): Buffer {
  const encKey = process.env.ENCRYPTION_KEY;
  if (encKey && encKey.length >= 64 && /^[0-9a-fA-F]+$/.test(encKey)) {
    return Buffer.from(encKey.slice(0, 64), "hex");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY (64-char hex) is required in production");
  }
  if (!warnedFallback) {
    warnedFallback = true;
    console.warn(
      "[envelope] ENCRYPTION_KEY not set; deriving key from JWT_SECRET. Set ENCRYPTION_KEY for production."
    );
  }
  const fallback = process.env.JWT_SECRET || "fallback-min-32-char-secret-for-encryption";
  return scryptSync(fallback, "kharchapay-treasury-salt", KEY_LENGTH);
}

export function encryptSecret(plaintextBytes: Uint8Array): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintextBytes)),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString("base64");
}

export function decryptSecret(ciphertext: string): Uint8Array {
  const key = getKey();
  const buf = Buffer.from(ciphertext, "base64");
  if (buf.length < IV_LENGTH + TAG_LENGTH) throw new Error("Invalid ciphertext");
  const iv = buf.subarray(0, IV_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH);
  const tag = buf.subarray(buf.length - TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);
  return new Uint8Array(Buffer.concat([decipher.update(encrypted), decipher.final()]));
}
