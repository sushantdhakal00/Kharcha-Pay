/**
 * Simple AES-256-GCM encryption for storing tokens at rest.
 * Uses ENCRYPTION_KEY (32 bytes hex) or derived from JWT_SECRET.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { env } from "./env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

function getKey(): Buffer {
  const encKey = env.ENCRYPTION_KEY;
  if (encKey && encKey.length >= 64 && /^[0-9a-fA-F]+$/.test(encKey)) {
    return Buffer.from(encKey.slice(0, 64), "hex");
  }
  if (env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY (64-char hex) is required in production");
  }
  const fallback = process.env.JWT_SECRET || "fallback-min-32-char-secret-for-encryption";
  return scryptSync(fallback, "kharchapay-salt", KEY_LENGTH);
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertext, "base64");
  if (buf.length < IV_LENGTH + TAG_LENGTH) throw new Error("Invalid ciphertext");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}
