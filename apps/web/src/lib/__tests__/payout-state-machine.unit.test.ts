import { describe, it, expect } from "vitest";
import { TreasuryPayoutIntentStatus } from "@prisma/client";
import {
  assertValidPayoutTransition,
  isTerminalStatus,
  isValidPayoutTransition,
  InvalidPayoutTransitionError,
} from "../fiat/payout-state-machine";

const S = TreasuryPayoutIntentStatus;

describe("payout-state-machine", () => {
  describe("isTerminalStatus", () => {
    it("returns true for COMPLETED", () => {
      expect(isTerminalStatus(S.COMPLETED)).toBe(true);
    });

    it("returns true for FAILED", () => {
      expect(isTerminalStatus(S.FAILED)).toBe(true);
    });

    it("returns true for CANCELED", () => {
      expect(isTerminalStatus(S.CANCELED)).toBe(true);
    });

    it("returns false for non-terminal statuses", () => {
      expect(isTerminalStatus(S.CREATED)).toBe(false);
      expect(isTerminalStatus(S.PENDING)).toBe(false);
      expect(isTerminalStatus(S.SENT_ONCHAIN)).toBe(false);
      expect(isTerminalStatus(S.PROCESSING)).toBe(false);
    });
  });

  describe("assertValidPayoutTransition", () => {
    it("allows CREATED → PENDING", () => {
      expect(() => assertValidPayoutTransition(S.CREATED, S.PENDING)).not.toThrow();
    });

    it("allows CREATED → CANCELED", () => {
      expect(() => assertValidPayoutTransition(S.CREATED, S.CANCELED)).not.toThrow();
    });

    it("allows CREATED → FAILED", () => {
      expect(() => assertValidPayoutTransition(S.CREATED, S.FAILED)).not.toThrow();
    });

    it("allows PENDING → SENT_ONCHAIN", () => {
      expect(() => assertValidPayoutTransition(S.PENDING, S.SENT_ONCHAIN)).not.toThrow();
    });

    it("allows PENDING → PROCESSING", () => {
      expect(() => assertValidPayoutTransition(S.PENDING, S.PROCESSING)).not.toThrow();
    });

    it("allows PENDING → FAILED", () => {
      expect(() => assertValidPayoutTransition(S.PENDING, S.FAILED)).not.toThrow();
    });

    it("allows PENDING → CANCELED", () => {
      expect(() => assertValidPayoutTransition(S.PENDING, S.CANCELED)).not.toThrow();
    });

    it("allows SENT_ONCHAIN → PROCESSING", () => {
      expect(() => assertValidPayoutTransition(S.SENT_ONCHAIN, S.PROCESSING)).not.toThrow();
    });

    it("allows SENT_ONCHAIN → FAILED", () => {
      expect(() => assertValidPayoutTransition(S.SENT_ONCHAIN, S.FAILED)).not.toThrow();
    });

    it("allows PROCESSING → COMPLETED", () => {
      expect(() => assertValidPayoutTransition(S.PROCESSING, S.COMPLETED)).not.toThrow();
    });

    it("allows PROCESSING → FAILED", () => {
      expect(() => assertValidPayoutTransition(S.PROCESSING, S.FAILED)).not.toThrow();
    });

    it("allows same-status (noop)", () => {
      expect(() => assertValidPayoutTransition(S.PENDING, S.PENDING)).not.toThrow();
      expect(() => assertValidPayoutTransition(S.COMPLETED, S.COMPLETED)).not.toThrow();
    });

    it("throws for COMPLETED → PENDING (terminal → non-terminal)", () => {
      expect(() => assertValidPayoutTransition(S.COMPLETED, S.PENDING)).toThrow(
        InvalidPayoutTransitionError
      );
    });

    it("throws for FAILED → PROCESSING (terminal → non-terminal)", () => {
      expect(() => assertValidPayoutTransition(S.FAILED, S.PROCESSING)).toThrow(
        InvalidPayoutTransitionError
      );
    });

    it("throws for CANCELED → PENDING (terminal → non-terminal)", () => {
      expect(() => assertValidPayoutTransition(S.CANCELED, S.PENDING)).toThrow(
        InvalidPayoutTransitionError
      );
    });

    it("throws for CREATED → COMPLETED (skips intermediate)", () => {
      expect(() => assertValidPayoutTransition(S.CREATED, S.COMPLETED)).toThrow(
        InvalidPayoutTransitionError
      );
    });

    it("throws for CREATED → PROCESSING (skips intermediate)", () => {
      expect(() => assertValidPayoutTransition(S.CREATED, S.PROCESSING)).toThrow(
        InvalidPayoutTransitionError
      );
    });

    it("throws for PROCESSING → CANCELED (not allowed)", () => {
      expect(() => assertValidPayoutTransition(S.PROCESSING, S.CANCELED)).toThrow(
        InvalidPayoutTransitionError
      );
    });

    it("error includes from and to statuses", () => {
      try {
        assertValidPayoutTransition(S.COMPLETED, S.CREATED);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidPayoutTransitionError);
        const err = e as InvalidPayoutTransitionError;
        expect(err.from).toBe(S.COMPLETED);
        expect(err.to).toBe(S.CREATED);
        expect(err.code).toBe("INVALID_PAYOUT_TRANSITION");
      }
    });
  });

  describe("isValidPayoutTransition", () => {
    it("returns true for valid transitions", () => {
      expect(isValidPayoutTransition(S.CREATED, S.PENDING)).toBe(true);
      expect(isValidPayoutTransition(S.PENDING, S.PROCESSING)).toBe(true);
      expect(isValidPayoutTransition(S.PROCESSING, S.COMPLETED)).toBe(true);
    });

    it("returns false for invalid transitions", () => {
      expect(isValidPayoutTransition(S.COMPLETED, S.PENDING)).toBe(false);
      expect(isValidPayoutTransition(S.CREATED, S.COMPLETED)).toBe(false);
    });

    it("returns true for same-status", () => {
      expect(isValidPayoutTransition(S.PENDING, S.PENDING)).toBe(true);
    });
  });
});
