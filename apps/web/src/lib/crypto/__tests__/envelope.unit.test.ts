import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptSecret, decryptSecret } from "../envelope";

describe("envelope encrypt/decrypt", () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.NODE_ENV = "test";
    process.env.ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it("encrypt -> decrypt returns original bytes", () => {
    const original = new Uint8Array([1, 2, 3, 64, 65, 255, 0]);
    const encrypted = encryptSecret(original);
    expect(encrypted).toBeTypeOf("string");
    expect(encrypted.length).toBeGreaterThan(0);

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBeInstanceOf(Uint8Array);
    expect(decrypted.length).toBe(original.length);
    expect(Array.from(decrypted)).toEqual(Array.from(original));
  });

  it("produces different ciphertext each time (random IV)", () => {
    const plain = new Uint8Array([1, 2, 3]);
    const a = encryptSecret(plain);
    const b = encryptSecret(plain);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toEqual(plain);
    expect(decryptSecret(b)).toEqual(plain);
  });

  it("handles Solana secret key size (64 bytes)", () => {
    const keypairBytes = new Uint8Array(64);
    for (let i = 0; i < 64; i++) keypairBytes[i] = i % 256;
    const encrypted = encryptSecret(keypairBytes);
    const decrypted = decryptSecret(encrypted);
    expect(Array.from(decrypted)).toEqual(Array.from(keypairBytes));
  });
});
