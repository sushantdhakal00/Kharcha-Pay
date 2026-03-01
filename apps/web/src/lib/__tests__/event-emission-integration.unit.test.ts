import { describe, it, expect } from "vitest";
import {
  payoutCreatedDedupKey,
  payoutStatusDedupKey,
  payoutFundedDedupKey,
  alertDedupKey,
  ledgerEntryDedupKey,
  buildPayoutEventPayload,
} from "../fiat/treasury-events";

describe("event emission dedup key integration", () => {
  it("payout lifecycle produces distinct dedup keys for each stage", () => {
    const intentId = "pi_lifecycle_1";
    const keys = new Set([
      payoutCreatedDedupKey(intentId),
      payoutStatusDedupKey(intentId, "PENDING"),
      payoutStatusDedupKey(intentId, "PROCESSING"),
      payoutStatusDedupKey(intentId, "COMPLETED"),
    ]);
    expect(keys.size).toBe(4);
  });

  it("funded dedup key differs per tx sig", () => {
    const intentId = "pi_fund_1";
    const key1 = payoutFundedDedupKey(intentId, "sig_aaaa_bbbb_cccc_dddd");
    const key2 = payoutFundedDedupKey(intentId, "sig_xxxx_yyyy_zzzz_1111");
    expect(key1).not.toBe(key2);
  });

  it("alert dedup keys differ per kind", () => {
    const orgId = "org_alert";
    const key1 = alertDedupKey(orgId, "HIGH_FAILURE_RATE");
    const key2 = alertDedupKey(orgId, "STUCK_PAYOUTS");
    expect(key1).not.toBe(key2);
  });

  it("ledger entry dedup keys are unique per entry", () => {
    expect(ledgerEntryDedupKey("e1")).not.toBe(ledgerEntryDedupKey("e2"));
  });

  it("payload serializes bigint amounts as strings", () => {
    const payload = buildPayoutEventPayload({
      id: "pi_big",
      orgId: "org_1",
      amountMinor: 999999999999n,
      currency: "USD",
      status: "COMPLETED",
      provider: "CIRCLE",
      providerPayoutId: "cp_big",
      circlePayoutId: null,
      payoutRail: "BANK_WIRE",
    });
    expect(typeof payload.amountMinor).toBe("string");
    expect(payload.amountMinor).toBe("999999999999");
  });

  it("replay of same dedup key is inherently idempotent by design", () => {
    const key = payoutStatusDedupKey("pi_replay", "COMPLETED");
    expect(key).toBe(payoutStatusDedupKey("pi_replay", "COMPLETED"));
  });

  it("FAILED and CANCELED produce different dedup keys", () => {
    const intentId = "pi_terminal";
    const failedKey = payoutStatusDedupKey(intentId, "FAILED");
    const canceledKey = payoutStatusDedupKey(intentId, "CANCELED");
    expect(failedKey).not.toBe(canceledKey);
  });

  it("status change event payload includes from/to when provided", () => {
    const payload = buildPayoutEventPayload(
      {
        id: "pi_trans",
        orgId: "org_1",
        amountMinor: 5000n,
        currency: "USD",
        status: "PROCESSING",
        provider: "CIRCLE",
        providerPayoutId: "cp_1",
        circlePayoutId: null,
        payoutRail: "BANK_WIRE",
      },
      { fromStatus: "PENDING", toStatus: "PROCESSING", source: "webhook" }
    );
    expect(payload.fromStatus).toBe("PENDING");
    expect(payload.toStatus).toBe("PROCESSING");
    expect(payload.source).toBe("webhook");
  });
});
