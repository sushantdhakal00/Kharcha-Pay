import type { ReconciliationResult, ReconciliationSeverityLevel } from "./treasury-reconciliation";

export interface ReconciliationAlert {
  type: "RECONCILIATION_DRIFT";
  severity: "warning" | "critical";
  message: string;
  details: Record<string, unknown>;
}

export function detectReconciliationDrift(
  results: ReconciliationResult[]
): ReconciliationAlert[] {
  const alerts: ReconciliationAlert[] = [];

  const criticalResults = results.filter((r) => r.severity === "CRITICAL");
  const warnResults = results.filter((r) => r.severity === "WARN");

  if (criticalResults.length > 0) {
    const topDrift = criticalResults[0];
    alerts.push({
      type: "RECONCILIATION_DRIFT",
      severity: "critical",
      message:
        `Critical balance drift detected: ${criticalResults.length} account(s) out of sync. ` +
        `Largest: ${topDrift.account}/${topDrift.currency} delta=${topDrift.deltaMinor.toString()} minor units`,
      details: {
        criticalCount: criticalResults.length,
        warnCount: warnResults.length,
        topAccount: topDrift.account,
        topCurrency: topDrift.currency,
        topDelta: topDrift.deltaMinor.toString(),
        topSource: topDrift.source,
      },
    });
  } else if (warnResults.length > 0) {
    alerts.push({
      type: "RECONCILIATION_DRIFT",
      severity: "warning",
      message: `Minor balance drift detected in ${warnResults.length} account(s)`,
      details: {
        criticalCount: 0,
        warnCount: warnResults.length,
      },
    });
  }

  return alerts;
}

export async function emitReconciliationAlertEvent(
  orgId: string,
  alert: ReconciliationAlert,
  deps: {
    emitTreasuryEvent: (params: {
      orgId: string;
      type: string;
      entityType: string;
      entityId: string;
      dedupKey: string;
      payload: Record<string, unknown>;
    }) => Promise<boolean>;
    alertDedupKey: (orgId: string, kind: string) => string;
  }
): Promise<boolean> {
  return deps
    .emitTreasuryEvent({
      orgId,
      type: "ALERT_RAISED",
      entityType: "ReconciliationAlert",
      entityId: "RECONCILIATION_DRIFT",
      dedupKey: deps.alertDedupKey(orgId, `recon-drift:${alert.severity}`),
      payload: {
        alertType: alert.type,
        severity: alert.severity,
        message: alert.message,
        ...alert.details,
      },
    })
    .catch(() => false);
}

export function buildReconciliationSlackBlocks(
  orgId: string,
  alert: ReconciliationAlert
): unknown[] {
  const emoji = alert.severity === "critical" ? "🚨" : "⚠️";
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} Treasury Reconciliation: ${alert.severity.toUpperCase()}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Org:* ${orgId}\n*Severity:* ${alert.severity}\n*Message:* ${alert.message}`,
      },
    },
  ];
}
