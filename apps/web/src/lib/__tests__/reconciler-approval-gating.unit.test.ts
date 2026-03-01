import { describe, it, expect } from "vitest";
import { selectEligibleIntentsFilter, computeBackoffMs } from "@/server/jobs/payout-reconciler";

describe("reconciler - approval gating", () => {
  it("selectEligibleIntentsFilter excludes REQUIRES_APPROVAL risk status", () => {
    const filter = selectEligibleIntentsFilter();
    expect(filter.riskStatus).toBeDefined();
    expect(filter.riskStatus).toEqual({ not: "REQUIRES_APPROVAL" });
  });

  it("selectEligibleIntentsFilter includes non-terminal statuses", () => {
    const filter = selectEligibleIntentsFilter();
    expect(filter.status).toBeDefined();
    expect(filter.status.in).toContain("PENDING");
    expect(filter.status.in).toContain("SENT_ONCHAIN");
    expect(filter.status.in).toContain("PROCESSING");
  });

  it("selectEligibleIntentsFilter does not include terminal statuses", () => {
    const filter = selectEligibleIntentsFilter();
    expect(filter.status.in).not.toContain("COMPLETED");
    expect(filter.status.in).not.toContain("FAILED");
    expect(filter.status.in).not.toContain("CANCELED");
    expect(filter.status.in).not.toContain("CREATED");
  });

  it("selectEligibleIntentsFilter requires provider payout id", () => {
    const filter = selectEligibleIntentsFilter();
    expect(filter.OR).toBeDefined();
    expect(filter.OR).toEqual([
      { providerPayoutId: { not: null } },
      { circlePayoutId: { not: null } },
    ]);
  });

  it("selectEligibleIntentsFilter includes nextRetryAt logic", () => {
    const filter = selectEligibleIntentsFilter();
    expect(filter.AND).toBeDefined();
    expect(filter.AND.length).toBeGreaterThanOrEqual(1);
  });

  it("computeBackoffMs returns expected values", () => {
    expect(computeBackoffMs(0)).toBe(60_000);
    expect(computeBackoffMs(1)).toBe(120_000);
    expect(computeBackoffMs(2)).toBe(240_000);
  });

  it("computeBackoffMs caps at 30 minutes", () => {
    expect(computeBackoffMs(100)).toBe(30 * 60 * 1000);
  });
});
