import { describe, it, expect } from "vitest";
import { formatSSEMessage, formatSSEPing } from "../fiat/treasury-events";

describe("SSE stream formatting", () => {
  it("event name is always 'treasury'", () => {
    const msg = formatSSEMessage({
      id: "ev_1",
      type: "PAYOUT_CREATED",
      payload: {},
      createdAt: new Date(),
    });
    expect(msg.startsWith("event: treasury\n")).toBe(true);
  });

  it("data is valid JSON on a single line", () => {
    const msg = formatSSEMessage({
      id: "ev_1",
      type: "ALERT_RAISED",
      payload: { key: "value", nested: { a: 1 } },
      createdAt: new Date("2026-01-01"),
    });
    const lines = msg.split("\n");
    const dataLine = lines.find((l) => l.startsWith("data: "))!;
    const json = dataLine.replace("data: ", "");
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("SSE message ends with double newline", () => {
    const msg = formatSSEMessage({
      id: "ev_1",
      type: "PAYOUT_COMPLETED",
      payload: {},
      createdAt: new Date(),
    });
    expect(msg.endsWith("\n\n")).toBe(true);
  });

  it("ping ends with double newline", () => {
    const ping = formatSSEPing();
    expect(ping.endsWith("\n\n")).toBe(true);
  });

  it("ping starts with comment marker", () => {
    const ping = formatSSEPing();
    expect(ping.startsWith(": ")).toBe(true);
  });

  it("since cursor: SSE message contains createdAt for cursor tracking", () => {
    const now = new Date("2026-02-21T10:00:00Z");
    const msg = formatSSEMessage({
      id: "ev_x",
      type: "PAYOUT_STATUS_CHANGED",
      payload: { fromStatus: "PENDING", toStatus: "PROCESSING" },
      createdAt: now,
    });
    const dataLine = msg.split("\n").find((l) => l.startsWith("data: "))!;
    const parsed = JSON.parse(dataLine.replace("data: ", ""));
    expect(parsed.createdAt).toBe("2026-02-21T10:00:00.000Z");
  });

  it("preserves payload structure", () => {
    const payload = {
      intentId: "pi_123",
      amountMinor: "50000",
      currency: "USD",
      provider: "CIRCLE",
    };
    const msg = formatSSEMessage({
      id: "ev_y",
      type: "PAYOUT_FUNDED_ONCHAIN",
      payload,
      createdAt: new Date(),
    });
    const dataLine = msg.split("\n").find((l) => l.startsWith("data: "))!;
    const parsed = JSON.parse(dataLine.replace("data: ", ""));
    expect(parsed.payload).toEqual(payload);
  });
});
