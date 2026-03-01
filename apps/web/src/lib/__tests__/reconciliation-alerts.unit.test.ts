import { describe, it, expect } from "vitest";
import {
  detectReconciliationDrift,
  buildReconciliationSlackBlocks,
  type ReconciliationAlert,
} from "../fiat/reconciliation-alerts";
import type { ReconciliationResult } from "../fiat/treasury-reconciliation";

function makeResult(
  severity: "INFO" | "WARN" | "CRITICAL",
  account = "CLEARING",
  delta = 0n
): ReconciliationResult {
  return {
    orgId: "org1",
    account,
    currency: "USD",
    source: "PROVIDER",
    expectedMinor: 10000n,
    observedMinor: 10000n + delta,
    deltaMinor: delta,
    severity,
    reason: `test-${severity}`,
  };
}

describe("Reconciliation Alerts", () => {
  describe("detectReconciliationDrift", () => {
    it("returns empty for all-INFO results", () => {
      const results = [makeResult("INFO"), makeResult("INFO")];
      const alerts = detectReconciliationDrift(results);
      expect(alerts).toHaveLength(0);
    });

    it("returns warning alert for WARN results", () => {
      const results = [makeResult("INFO"), makeResult("WARN", "CLEARING", 100n)];
      const alerts = detectReconciliationDrift(results);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe("warning");
      expect(alerts[0].type).toBe("RECONCILIATION_DRIFT");
    });

    it("returns critical alert for CRITICAL results", () => {
      const results = [
        makeResult("INFO"),
        makeResult("CRITICAL", "PROVIDER_WALLET", -5000n),
      ];
      const alerts = detectReconciliationDrift(results);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe("critical");
    });

    it("critical alert includes top drift details", () => {
      const results = [
        makeResult("CRITICAL", "PROVIDER_WALLET", -5000n),
        makeResult("CRITICAL", "TREASURY_WALLET", -3000n),
      ];
      const alerts = detectReconciliationDrift(results);
      expect(alerts[0].details.criticalCount).toBe(2);
      expect(alerts[0].details.topAccount).toBe("PROVIDER_WALLET");
      expect(alerts[0].details.topDelta).toBe("-5000");
    });

    it("warning alert includes warn count", () => {
      const results = [
        makeResult("WARN", "CLEARING", 100n),
        makeResult("WARN", "VENDOR_PAYABLE", 200n),
      ];
      const alerts = detectReconciliationDrift(results);
      expect(alerts[0].details.warnCount).toBe(2);
    });

    it("returns empty for empty results", () => {
      expect(detectReconciliationDrift([])).toHaveLength(0);
    });

    it("critical takes priority over warn", () => {
      const results = [
        makeResult("WARN", "CLEARING", 100n),
        makeResult("CRITICAL", "PROVIDER_WALLET", -5000n),
      ];
      const alerts = detectReconciliationDrift(results);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe("critical");
    });
  });

  describe("buildReconciliationSlackBlocks", () => {
    it("builds blocks for critical alert", () => {
      const alert: ReconciliationAlert = {
        type: "RECONCILIATION_DRIFT",
        severity: "critical",
        message: "Test critical drift",
        details: { criticalCount: 1 },
      };
      const blocks = buildReconciliationSlackBlocks("org1", alert);
      expect(blocks).toHaveLength(2);
      expect((blocks[0] as any).type).toBe("header");
      expect((blocks[1] as any).type).toBe("section");
    });

    it("includes org and severity in Slack message", () => {
      const alert: ReconciliationAlert = {
        type: "RECONCILIATION_DRIFT",
        severity: "warning",
        message: "Test warning drift",
        details: {},
      };
      const blocks = buildReconciliationSlackBlocks("org-abc", alert);
      const text = (blocks[1] as any).text.text;
      expect(text).toContain("org-abc");
      expect(text).toContain("warning");
    });

    it("uses correct emoji for critical", () => {
      const alert: ReconciliationAlert = {
        type: "RECONCILIATION_DRIFT",
        severity: "critical",
        message: "Critical",
        details: {},
      };
      const blocks = buildReconciliationSlackBlocks("org1", alert);
      const headerText = (blocks[0] as any).text.text;
      expect(headerText).toContain("🚨");
    });

    it("uses correct emoji for warning", () => {
      const alert: ReconciliationAlert = {
        type: "RECONCILIATION_DRIFT",
        severity: "warning",
        message: "Warning",
        details: {},
      };
      const blocks = buildReconciliationSlackBlocks("org1", alert);
      const headerText = (blocks[0] as any).text.text;
      expect(headerText).toContain("⚠️");
    });
  });
});
