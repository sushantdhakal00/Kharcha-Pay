import { describe, it, expect } from "vitest";
import {
  payoutCreatedDedupKey,
  payoutStatusDedupKey,
  payoutFundedDedupKey,
  alertDedupKey,
  ledgerEntryDedupKey,
  buildPayoutEventPayload,
  formatSSEMessage,
  formatSSEPing,
} from "../fiat/treasury-events";

describe("treasury-events dedup keys", () => {
  it("payoutCreatedDedupKey includes intent id", () => {
    const key = payoutCreatedDedupKey("intent_abc");
    expect(key).toBe("payout:intent_abc:created");
  });

  it("payoutStatusDedupKey includes intent id and status", () => {
    const key = payoutStatusDedupKey("intent_xyz", "COMPLETED");
    expect(key).toBe("payout:intent_xyz:status:COMPLETED");
  });

  it("payoutFundedDedupKey includes truncated txSig", () => {
    const txSig = "abcdefghijklmnopqrstuvwxyz1234567890";
    const key = payoutFundedDedupKey("intent_1", txSig);
    expect(key).toBe("payout:intent_1:funded:abcdefghijklmnop");
  });

  it("alertDedupKey includes org, kind and windowed time", () => {
    const key = alertDedupKey("org_1", "HIGH_FAILURE_RATE");
    expect(key).toMatch(/^alert:org_1:HIGH_FAILURE_RATE:/);
    expect(key).toContain("T");
  });

  it("alertDedupKey produces same key within same time window", () => {
    const key1 = alertDedupKey("org_1", "STUCK_PAYOUTS", 60);
    const key2 = alertDedupKey("org_1", "STUCK_PAYOUTS", 60);
    expect(key1).toBe(key2);
  });

  it("ledgerEntryDedupKey wraps entry id", () => {
    const key = ledgerEntryDedupKey("entry_123");
    expect(key).toBe("ledger:entry_123");
  });

  it("different intent ids produce different dedup keys", () => {
    const a = payoutCreatedDedupKey("aaa");
    const b = payoutCreatedDedupKey("bbb");
    expect(a).not.toBe(b);
  });

  it("different statuses produce different dedup keys", () => {
    const a = payoutStatusDedupKey("x", "PROCESSING");
    const b = payoutStatusDedupKey("x", "COMPLETED");
    expect(a).not.toBe(b);
  });
});

describe("buildPayoutEventPayload", () => {
  const baseIntent = {
    id: "pi_1",
    orgId: "org_1",
    vendorId: "v_1",
    amountMinor: 10000n,
    currency: "USD",
    status: "CREATED",
    provider: "CIRCLE",
    providerPayoutId: "cp_1",
    circlePayoutId: null,
    payoutRail: "BANK_WIRE",
  };

  it("returns correct fields", () => {
    const payload = buildPayoutEventPayload(baseIntent);
    expect(payload.intentId).toBe("pi_1");
    expect(payload.vendorId).toBe("v_1");
    expect(payload.amountMinor).toBe("10000");
    expect(payload.currency).toBe("USD");
    expect(payload.status).toBe("CREATED");
    expect(payload.provider).toBe("CIRCLE");
    expect(payload.providerPayoutId).toBe("cp_1");
    expect(payload.payoutRail).toBe("BANK_WIRE");
  });

  it("uses circlePayoutId as fallback when providerPayoutId is null", () => {
    const intent = { ...baseIntent, providerPayoutId: null, circlePayoutId: "cid_1" };
    const payload = buildPayoutEventPayload(intent);
    expect(payload.providerPayoutId).toBe("cid_1");
  });

  it("merges extra fields", () => {
    const payload = buildPayoutEventPayload(baseIntent, { fromStatus: "CREATED", toStatus: "PENDING" });
    expect(payload.fromStatus).toBe("CREATED");
    expect(payload.toStatus).toBe("PENDING");
    expect(payload.intentId).toBe("pi_1");
  });

  it("handles null vendorId gracefully", () => {
    const intent = { ...baseIntent, vendorId: null };
    const payload = buildPayoutEventPayload(intent);
    expect(payload.vendorId).toBeNull();
  });

  it("handles number amountMinor", () => {
    const intent = { ...baseIntent, amountMinor: 5000 };
    const payload = buildPayoutEventPayload(intent);
    expect(payload.amountMinor).toBe("5000");
  });
});

describe("formatSSEMessage", () => {
  it("produces valid SSE format", () => {
    const msg = formatSSEMessage({
      id: "ev_1",
      type: "PAYOUT_CREATED",
      payload: { intentId: "pi_1" },
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(msg).toContain("event: treasury\n");
    expect(msg).toContain("data: ");
    expect(msg).toMatch(/\n\n$/);
    const dataLine = msg.split("\n").find((l: string) => l.startsWith("data: "));
    expect(dataLine).toBeDefined();
    const parsed = JSON.parse(dataLine!.replace("data: ", ""));
    expect(parsed.id).toBe("ev_1");
    expect(parsed.type).toBe("PAYOUT_CREATED");
    expect(parsed.payload.intentId).toBe("pi_1");
  });

  it("handles string createdAt", () => {
    const msg = formatSSEMessage({
      id: "ev_2",
      type: "PAYOUT_FAILED",
      payload: {},
      createdAt: "2026-02-21T12:00:00Z",
    });
    const dataLine = msg.split("\n").find((l: string) => l.startsWith("data: "));
    const parsed = JSON.parse(dataLine!.replace("data: ", ""));
    expect(parsed.createdAt).toBe("2026-02-21T12:00:00Z");
  });
});

describe("formatSSEPing", () => {
  it("produces a comment line with ping", () => {
    const ping = formatSSEPing();
    expect(ping).toMatch(/^: ping /);
    expect(ping).toMatch(/\n\n$/);
  });
});
