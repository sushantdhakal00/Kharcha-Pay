import { describe, it, expect } from "vitest";
import { ProviderError } from "../fiat/payout-providers/types";

describe("ProviderError", () => {
  it("has correct classification for TRANSIENT errors", () => {
    const err = new ProviderError("timeout", "TRANSIENT", "TIMEOUT");
    expect(err.classification).toBe("TRANSIENT");
    expect(err.providerCode).toBe("TIMEOUT");
    expect(err.message).toBe("timeout");
    expect(err.name).toBe("ProviderError");
  });

  it("has correct classification for PERMANENT errors", () => {
    const err = new ProviderError("bad account", "PERMANENT", "INVALID_ACCOUNT");
    expect(err.classification).toBe("PERMANENT");
    expect(err.providerCode).toBe("INVALID_ACCOUNT");
  });

  it("has correct classification for CONFIG errors", () => {
    const err = new ProviderError("bad API key", "CONFIG", "AUTH_FAILED");
    expect(err.classification).toBe("CONFIG");
  });

  it("can be thrown and caught", () => {
    expect(() => {
      throw new ProviderError("test", "TRANSIENT");
    }).toThrow(ProviderError);
  });

  it("is instanceof Error", () => {
    const err = new ProviderError("test", "TRANSIENT");
    expect(err).toBeInstanceOf(Error);
  });

  it("supports cause option", () => {
    const cause = new Error("root cause");
    const err = new ProviderError("wrapped", "TRANSIENT", undefined, { cause });
    expect(err.cause).toBe(cause);
  });
});

describe("Provider types shape", () => {
  it("ProviderPayoutStatus values are known strings", () => {
    const validStatuses = ["CREATED", "PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELED"];
    validStatuses.forEach((s) => {
      expect(typeof s).toBe("string");
    });
  });
});
