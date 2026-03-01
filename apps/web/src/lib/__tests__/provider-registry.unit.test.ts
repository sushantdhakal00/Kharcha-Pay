import { describe, it, expect } from "vitest";
import {
  getPayoutProvider,
  listPayoutProviders,
  registerPayoutProvider,
} from "../fiat/payout-providers";
import type { PayoutProvider } from "../fiat/payout-providers/types";

describe("provider registry", () => {
  it("returns CIRCLE provider by default", () => {
    const provider = getPayoutProvider("CIRCLE");
    expect(provider).toBeDefined();
    expect(provider.name).toBe("CIRCLE");
  });

  it("is case-insensitive on lookup", () => {
    const a = getPayoutProvider("circle");
    const b = getPayoutProvider("Circle");
    const c = getPayoutProvider("CIRCLE");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("throws for unknown provider", () => {
    expect(() => getPayoutProvider("STRIPE_TREASURY")).toThrow("Unknown payout provider");
  });

  it("lists available providers", () => {
    const providers = listPayoutProviders();
    expect(providers).toContain("CIRCLE");
  });

  it("allows registering a custom provider", () => {
    const mockProvider: PayoutProvider = {
      name: "TEST_PROVIDER",
      createRecipient: async () => ({ providerRecipientId: "test" }),
      createPayout: async () => ({
        providerPayoutId: "p1",
        initialStatus: "CREATED",
      }),
      getPayout: async () => ({ status: "PENDING", rawStatus: "pending" }),
      normalizeStatus: () => "PENDING",
      normalizeFailure: () => null,
    };

    registerPayoutProvider("TEST_PROVIDER", mockProvider);
    const retrieved = getPayoutProvider("TEST_PROVIDER");
    expect(retrieved.name).toBe("TEST_PROVIDER");
  });
});
