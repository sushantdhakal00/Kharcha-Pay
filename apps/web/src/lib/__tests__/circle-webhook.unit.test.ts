import { describe, it, expect } from "vitest";
import { parseCircleWebhook, mapCircleStatusToIntent } from "../fiat/circle-webhook";

describe("parseCircleWebhook", () => {
  it("extracts eventId, eventType, objectId from standard payload", () => {
    const result = parseCircleWebhook({
      id: "evt_123",
      type: "transfer.complete",
      data: { id: "obj_456", status: "complete" },
    });
    expect(result).toEqual({
      eventId: "evt_123",
      eventType: "transfer.complete",
      objectId: "obj_456",
      status: "complete",
    });
  });

  it("extracts objectId from nested data.object.id", () => {
    const result = parseCircleWebhook({
      id: "evt_789",
      type: "payment.created",
      data: { object: { id: "pay_abc", status: "pending" } },
    });
    expect(result).toEqual({
      eventId: "evt_789",
      eventType: "payment.created",
      objectId: "pay_abc",
      status: "pending",
    });
  });

  it("returns null for missing required fields", () => {
    expect(parseCircleWebhook({})).toBeNull();
    expect(parseCircleWebhook({ id: "e1" })).toBeNull();
    expect(parseCircleWebhook({ id: "e1", type: "t" })).toBeNull();
    expect(parseCircleWebhook(null)).toBeNull();
    expect(parseCircleWebhook("string")).toBeNull();
  });

  it("handles missing status gracefully", () => {
    const result = parseCircleWebhook({
      id: "evt_1",
      type: "transfer.created",
      data: { id: "obj_1" },
    });
    expect(result).toEqual({
      eventId: "evt_1",
      eventType: "transfer.created",
      objectId: "obj_1",
      status: undefined,
    });
  });
});

describe("mapCircleStatusToIntent", () => {
  it("maps pending/processing to PENDING", () => {
    expect(mapCircleStatusToIntent("pending")).toBe("PENDING");
    expect(mapCircleStatusToIntent("processing")).toBe("PENDING");
  });

  it("maps complete/succeeded/paid to COMPLETED", () => {
    expect(mapCircleStatusToIntent("complete")).toBe("COMPLETED");
    expect(mapCircleStatusToIntent("completed")).toBe("COMPLETED");
    expect(mapCircleStatusToIntent("succeeded")).toBe("COMPLETED");
    expect(mapCircleStatusToIntent("paid")).toBe("COMPLETED");
  });

  it("maps failed/canceled/cancelled/rejected to FAILED", () => {
    expect(mapCircleStatusToIntent("failed")).toBe("FAILED");
    expect(mapCircleStatusToIntent("canceled")).toBe("FAILED");
    expect(mapCircleStatusToIntent("cancelled")).toBe("FAILED");
    expect(mapCircleStatusToIntent("rejected")).toBe("FAILED");
  });

  it("is case-insensitive", () => {
    expect(mapCircleStatusToIntent("COMPLETE")).toBe("COMPLETED");
    expect(mapCircleStatusToIntent("Pending")).toBe("PENDING");
    expect(mapCircleStatusToIntent("FAILED")).toBe("FAILED");
  });

  it("returns null for unknown or undefined status", () => {
    expect(mapCircleStatusToIntent(undefined)).toBeNull();
    expect(mapCircleStatusToIntent("unknown_state")).toBeNull();
    expect(mapCircleStatusToIntent("")).toBeNull();
  });
});
