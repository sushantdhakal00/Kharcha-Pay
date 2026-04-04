import { describe, it, expect } from "vitest";
import {
  normalizeCircleStatus,
  normalizeCircleFailure,
  mapCircleStatusToIntentStatus,
} from "../fiat/payout-providers/circle/circle-provider";

describe("CircleProvider normalization", () => {
  describe("normalizeCircleStatus", () => {
    it("maps pending to PENDING", () => {
      expect(normalizeCircleStatus("pending")).toBe("PENDING");
    });

    it("maps queued to PENDING", () => {
      expect(normalizeCircleStatus("queued")).toBe("PENDING");
    });

    it("maps processing to PROCESSING", () => {
      expect(normalizeCircleStatus("processing")).toBe("PROCESSING");
    });

    it("maps complete to COMPLETED", () => {
      expect(normalizeCircleStatus("complete")).toBe("COMPLETED");
    });

    it("maps completed to COMPLETED", () => {
      expect(normalizeCircleStatus("completed")).toBe("COMPLETED");
    });

    it("maps paid to COMPLETED", () => {
      expect(normalizeCircleStatus("paid")).toBe("COMPLETED");
    });

    it("maps failed to FAILED", () => {
      expect(normalizeCircleStatus("failed")).toBe("FAILED");
    });

    it("maps rejected to FAILED", () => {
      expect(normalizeCircleStatus("rejected")).toBe("FAILED");
    });

    it("maps returned to FAILED", () => {
      expect(normalizeCircleStatus("returned")).toBe("FAILED");
    });

    it("maps canceled to CANCELED", () => {
      expect(normalizeCircleStatus("canceled")).toBe("CANCELED");
    });

    it("maps cancelled (British) to CANCELED", () => {
      expect(normalizeCircleStatus("cancelled")).toBe("CANCELED");
    });

    it("is case-insensitive", () => {
      expect(normalizeCircleStatus("COMPLETE")).toBe("COMPLETED");
      expect(normalizeCircleStatus("Pending")).toBe("PENDING");
      expect(normalizeCircleStatus("PROCESSING")).toBe("PROCESSING");
      expect(normalizeCircleStatus("FAILED")).toBe("FAILED");
    });

    it("returns null for unknown status", () => {
      expect(normalizeCircleStatus("unknown")).toBeNull();
      expect(normalizeCircleStatus("")).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(normalizeCircleStatus(undefined as unknown as string)).toBeNull();
    });
  });

  describe("mapCircleStatusToIntentStatus", () => {
    it("maps pending to PENDING intent status", () => {
      expect(mapCircleStatusToIntentStatus("pending")).toBe("PENDING");
    });

    it("maps complete to COMPLETED intent status", () => {
      expect(mapCircleStatusToIntentStatus("complete")).toBe("COMPLETED");
    });

    it("maps failed to FAILED intent status", () => {
      expect(mapCircleStatusToIntentStatus("failed")).toBe("FAILED");
    });

    it("returns null for undefined", () => {
      expect(mapCircleStatusToIntentStatus(undefined)).toBeNull();
    });

    it("returns null for unknown status", () => {
      expect(mapCircleStatusToIntentStatus("banana")).toBeNull();
    });
  });

  describe("normalizeCircleFailure", () => {
    it("extracts errorCode and errorMessage", () => {
      const result = normalizeCircleFailure({
        errorCode: "insufficient_funds",
        errorMessage: "Not enough balance",
      });
      expect(result).toEqual({
        code: "insufficient_funds",
        message: "Not enough balance",
        classification: "PERMANENT",
      });
    });

    it("classifies TRANSIENT for unknown codes", () => {
      const result = normalizeCircleFailure({
        errorCode: "timeout",
        errorMessage: "Request timed out",
      });
      expect(result).toEqual({
        code: "timeout",
        message: "Request timed out",
        classification: "TRANSIENT",
      });
    });

    it("classifies CONFIG for unauthorized", () => {
      const result = normalizeCircleFailure({
        errorCode: "unauthorized",
        errorMessage: "Bad API key",
      });
      expect(result).toEqual({
        code: "unauthorized",
        message: "Bad API key",
        classification: "CONFIG",
      });
    });

    it("classifies PERMANENT for compliance", () => {
      const result = normalizeCircleFailure({
        errorCode: "compliance_block",
        errorMessage: "Blocked by compliance",
      });
      expect(result).toEqual({
        code: "compliance_block",
        message: "Blocked by compliance",
        classification: "PERMANENT",
      });
    });

    it("classifies PERMANENT for denied", () => {
      const result = normalizeCircleFailure({
        errorCode: "denied_by_bank",
        errorMessage: "Bank rejected transfer",
      });
      expect(result).toEqual({
        code: "denied_by_bank",
        message: "Bank rejected transfer",
        classification: "PERMANENT",
      });
    });

    it("classifies CONFIG for not_configured", () => {
      const result = normalizeCircleFailure({
        errorCode: "not_configured",
        errorMessage: "Provider not set up",
      });
      expect(result).toEqual({
        code: "not_configured",
        message: "Provider not set up",
        classification: "CONFIG",
      });
    });

    it("falls back to code/message fields", () => {
      const result = normalizeCircleFailure({
        code: "SOME_ERROR",
        message: "Something happened",
      });
      expect(result).toEqual({
        code: "SOME_ERROR",
        message: "Something happened",
        classification: "TRANSIENT",
      });
    });

    it("returns null for null input", () => {
      expect(normalizeCircleFailure(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(normalizeCircleFailure(undefined)).toBeNull();
    });

    it("returns null for non-object input", () => {
      expect(normalizeCircleFailure("string")).toBeNull();
    });

    it("returns defaults for empty object", () => {
      const result = normalizeCircleFailure({});
      expect(result).toEqual({
        code: "UNKNOWN",
        message: "Unknown provider failure",
        classification: "TRANSIENT",
      });
    });
  });
});
