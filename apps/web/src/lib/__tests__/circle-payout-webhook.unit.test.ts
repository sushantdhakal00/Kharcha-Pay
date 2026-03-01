import { describe, it, expect } from "vitest";
import {
  mapCircleStatusToPayoutStatus,
  isPayoutEvent,
} from "../fiat/circle-webhook";
import { mapCirclePayoutStatus } from "../fiat/fiat-payout-service";

describe("mapCircleStatusToPayoutStatus (webhook)", () => {
  it("maps pending/queued to PENDING", () => {
    expect(mapCircleStatusToPayoutStatus("pending")).toBe("PENDING");
    expect(mapCircleStatusToPayoutStatus("queued")).toBe("PENDING");
  });

  it("maps processing to PROCESSING", () => {
    expect(mapCircleStatusToPayoutStatus("processing")).toBe("PROCESSING");
  });

  it("maps complete/completed/paid to COMPLETED", () => {
    expect(mapCircleStatusToPayoutStatus("complete")).toBe("COMPLETED");
    expect(mapCircleStatusToPayoutStatus("completed")).toBe("COMPLETED");
    expect(mapCircleStatusToPayoutStatus("paid")).toBe("COMPLETED");
  });

  it("maps failed/rejected/returned to FAILED", () => {
    expect(mapCircleStatusToPayoutStatus("failed")).toBe("FAILED");
    expect(mapCircleStatusToPayoutStatus("rejected")).toBe("FAILED");
    expect(mapCircleStatusToPayoutStatus("returned")).toBe("FAILED");
  });

  it("maps canceled/cancelled to CANCELED", () => {
    expect(mapCircleStatusToPayoutStatus("canceled")).toBe("CANCELED");
    expect(mapCircleStatusToPayoutStatus("cancelled")).toBe("CANCELED");
  });

  it("is case-insensitive", () => {
    expect(mapCircleStatusToPayoutStatus("COMPLETE")).toBe("COMPLETED");
    expect(mapCircleStatusToPayoutStatus("Pending")).toBe("PENDING");
    expect(mapCircleStatusToPayoutStatus("PROCESSING")).toBe("PROCESSING");
  });

  it("returns null for unknown or undefined status", () => {
    expect(mapCircleStatusToPayoutStatus(undefined)).toBeNull();
    expect(mapCircleStatusToPayoutStatus("")).toBeNull();
    expect(mapCircleStatusToPayoutStatus("unknown")).toBeNull();
  });
});

describe("mapCirclePayoutStatus (service)", () => {
  it("maps pending to PENDING", () => {
    expect(mapCirclePayoutStatus("pending")).toBe("PENDING");
  });

  it("maps complete to COMPLETED", () => {
    expect(mapCirclePayoutStatus("complete")).toBe("COMPLETED");
  });

  it("maps failed to FAILED", () => {
    expect(mapCirclePayoutStatus("failed")).toBe("FAILED");
  });

  it("returns null for undefined", () => {
    expect(mapCirclePayoutStatus(undefined)).toBeNull();
  });
});

describe("isPayoutEvent", () => {
  it("returns true for payout event types", () => {
    expect(isPayoutEvent("payouts.created")).toBe(true);
    expect(isPayoutEvent("payouts.completed")).toBe(true);
    expect(isPayoutEvent("payouts.failed")).toBe(true);
    expect(isPayoutEvent("payout.updated")).toBe(true);
  });

  it("returns false for non-payout event types", () => {
    expect(isPayoutEvent("transfer.complete")).toBe(false);
    expect(isPayoutEvent("payment.created")).toBe(false);
    expect(isPayoutEvent("wire.deposit")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isPayoutEvent("PAYOUTS.COMPLETED")).toBe(true);
    expect(isPayoutEvent("Payout.Created")).toBe(true);
  });
});
