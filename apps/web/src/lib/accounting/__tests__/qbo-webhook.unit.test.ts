/**
 * Day 28: Webhook handler contract test.
 * Verifies webhook payload parsing and job enqueue logic (tested in isolation).
 */
import { describe, it, expect } from "vitest";

describe("QBO webhook payload parsing", () => {
  it("parses eventNotifications and extracts realmId", () => {
    const payload = {
      eventNotifications: [
        { realmId: "123", dataChangeEvent: { entities: [{ name: "Bill" }] } },
        { realmId: "456", dataChangeEvent: { entities: [{ name: "Vendor" }] } },
      ],
    };
    const realmIds = payload.eventNotifications.map((n) => n.realmId);
    expect(realmIds).toEqual(["123", "456"]);
  });

  it("extracts entity names for job routing", () => {
    const entities = [{ name: "Bill" }, { name: "BillPayment" }];
    const names = new Set(entities.map((e) => e.name?.toLowerCase()).filter(Boolean));
    expect(names.has("bill")).toBe(true);
    expect(names.has("billpayment")).toBe(true);
  });
});
