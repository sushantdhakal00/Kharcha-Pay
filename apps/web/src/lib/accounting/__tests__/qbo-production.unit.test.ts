/**
 * Day 28: Unit tests for QBO production readiness.
 */
import { describe, it, expect } from "vitest";
import { mapQboErrorToGuidance } from "../map-qbo-error";

describe("mapQboErrorToGuidance", () => {
  it("maps AccountRef errors", () => {
    const { message, fixHint } = mapQboErrorToGuidance(new Error("AccountRef is required"));
    expect(message).toBe("AccountRef missing mapping");
    expect(fixHint).toContain("GL code");
  });

  it("maps vendor not found", () => {
    const { message } = mapQboErrorToGuidance(new Error("Vendor not found"));
    expect(message).toBe("Vendor not found or inactive");
  });

  it("maps currency mismatch", () => {
    const { message } = mapQboErrorToGuidance(new Error("Currency mismatch"));
    expect(message).toBe("Currency mismatch");
  });

  it("maps auth expired", () => {
    const { message } = mapQboErrorToGuidance(new Error("QBO_UNAUTHORIZED"));
    expect(message).toBe("Auth expired; reconnect");
  });

  it("returns raw message for unknown errors", () => {
    const { message } = mapQboErrorToGuidance(new Error("Some other error"));
    expect(message).toBe("Some other error");
  });
});

describe("currency guard logic", () => {
  const shouldBlockExport = (
    invoiceCurrency: string,
    homeCurrency: string,
    multiCurrencyEnabled: boolean
  ) => invoiceCurrency !== homeCurrency && !multiCurrencyEnabled;

  it("blocks when invoice currency != home and multiCurrency disabled", () => {
    expect(shouldBlockExport("EUR", "USD", false)).toBe(true);
  });

  it("allows when invoice currency == home", () => {
    expect(shouldBlockExport("USD", "USD", false)).toBe(false);
  });

  it("allows when multiCurrency enabled", () => {
    expect(shouldBlockExport("EUR", "USD", true)).toBe(false);
  });
});
