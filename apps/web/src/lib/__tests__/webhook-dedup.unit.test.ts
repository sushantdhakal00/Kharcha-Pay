import { describe, it, expect } from "vitest";
import { createHash } from "crypto";

function computePayloadHash(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex")
    .slice(0, 32);
}

function deriveStableEventId(body: unknown): string {
  return `derived-${computePayloadHash(body)}`;
}

describe("webhook dedup helpers", () => {
  describe("computePayloadHash", () => {
    it("returns a 32-char hex string", () => {
      const hash = computePayloadHash({ type: "test", data: { id: "abc" } });
      expect(hash).toHaveLength(32);
      expect(hash).toMatch(/^[0-9a-f]{32}$/);
    });

    it("is deterministic", () => {
      const payload = { type: "payouts.completed", data: { id: "p1" } };
      expect(computePayloadHash(payload)).toBe(computePayloadHash(payload));
    });

    it("different payloads produce different hashes", () => {
      const a = computePayloadHash({ id: "1" });
      const b = computePayloadHash({ id: "2" });
      expect(a).not.toBe(b);
    });
  });

  describe("deriveStableEventId", () => {
    it("prefixes with derived-", () => {
      const id = deriveStableEventId({ foo: "bar" });
      expect(id).toMatch(/^derived-[0-9a-f]{32}$/);
    });

    it("is deterministic", () => {
      const payload = { test: true };
      expect(deriveStableEventId(payload)).toBe(deriveStableEventId(payload));
    });
  });
});
