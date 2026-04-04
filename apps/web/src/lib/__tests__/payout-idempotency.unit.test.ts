import { describe, it, expect } from "vitest";
import { _deriveCircleRequestId } from "../fiat/fiat-payout-service";

describe("deriveCircleRequestId", () => {
  it("returns a UUID-shaped string", () => {
    const result = _deriveCircleRequestId("test-key-123");
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(result).toMatch(uuidRegex);
  });

  it("is deterministic (same input → same output)", () => {
    const a = _deriveCircleRequestId("my-idempotency-key");
    const b = _deriveCircleRequestId("my-idempotency-key");
    expect(a).toBe(b);
  });

  it("produces different outputs for different inputs", () => {
    const a = _deriveCircleRequestId("key-1");
    const b = _deriveCircleRequestId("key-2");
    expect(a).not.toBe(b);
  });
});
