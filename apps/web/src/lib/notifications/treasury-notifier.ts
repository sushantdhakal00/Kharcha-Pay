import type { PayoutAlert } from "@/lib/fiat/payout-alerts";
import { emitTreasuryEvent, alertDedupKey } from "@/lib/fiat/treasury-events";

function isNotificationsEnabled(): boolean {
  return process.env.INTERNAL_NOTIFICATIONS_ENABLED === "true";
}

function getSlackWebhookUrl(): string | undefined {
  return process.env.SLACK_TREASURY_WEBHOOK_URL;
}

export interface PayoutFailedInfo {
  intentId: string;
  orgId: string;
  amountMinor: bigint | number;
  currency: string;
  provider: string;
  failureCode?: string | null;
  failureMessage?: string | null;
}

async function postSlackMessage(
  webhookUrl: string,
  blocks: unknown[]
): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });
    return res.ok;
  } catch (e) {
    console.error("[treasury-notifier] Slack post failed:", e);
    return false;
  }
}

function buildAlertSlackBlocks(alert: PayoutAlert, orgId: string): unknown[] {
  const severityEmoji = alert.severity === "critical" ? "🚨" : "⚠️";
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${severityEmoji} Treasury Alert: ${alert.type}`,
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

function buildPayoutFailedSlackBlocks(info: PayoutFailedInfo): unknown[] {
  const amount = (Number(info.amountMinor) / 100).toFixed(2);
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🚨 Payout Failed",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `*Org:* ${info.orgId}`,
          `*Intent:* ${info.intentId}`,
          `*Amount:* ${amount} ${info.currency}`,
          `*Provider:* ${info.provider}`,
          info.failureCode ? `*Code:* ${info.failureCode}` : null,
          info.failureMessage ? `*Reason:* ${info.failureMessage}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    },
  ];
}

function buildRetryStormSlackBlocks(
  orgId: string,
  details: Record<string, unknown>
): unknown[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "⚠️ Retry Storm Detected",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Org:* ${orgId}\n*Count:* ${details.count ?? "?"}\n*Threshold:* ${details.retryThreshold ?? "?"}`,
      },
    },
  ];
}

export async function notifyTreasuryAlert(
  orgId: string,
  alert: PayoutAlert
): Promise<boolean> {
  if (!isNotificationsEnabled()) return false;
  if (alert.severity !== "critical") return false;

  const emitted = await emitTreasuryEvent({
    orgId,
    type: "ALERT_RAISED",
    entityType: "PayoutAlert",
    entityId: alert.type,
    dedupKey: alertDedupKey(orgId, `notify:${alert.type}`),
    payload: { alertType: alert.type, severity: alert.severity, message: alert.message },
  }).catch(() => false);

  if (!emitted) return false;

  const webhookUrl = getSlackWebhookUrl();
  if (webhookUrl) {
    await postSlackMessage(webhookUrl, buildAlertSlackBlocks(alert, orgId));
  }

  sendEmailStub(
    `Treasury Alert [${alert.severity}]: ${alert.type}`,
    `Org: ${orgId}\n${alert.message}`
  );

  return true;
}

export async function notifyPayoutFailed(
  info: PayoutFailedInfo
): Promise<boolean> {
  if (!isNotificationsEnabled()) return false;
  if (!info.failureCode) return false;

  const emitted = await emitTreasuryEvent({
    orgId: info.orgId,
    type: "ALERT_RAISED",
    entityType: "TreasuryPayoutIntent",
    entityId: info.intentId,
    dedupKey: alertDedupKey(info.orgId, `payout-failed:${info.intentId}`),
    payload: {
      alertType: "PAYOUT_FAILED",
      intentId: info.intentId,
      failureCode: info.failureCode,
    },
  }).catch(() => false);

  if (!emitted) return false;

  const webhookUrl = getSlackWebhookUrl();
  if (webhookUrl) {
    await postSlackMessage(webhookUrl, buildPayoutFailedSlackBlocks(info));
  }

  sendEmailStub(
    `Payout Failed: ${info.intentId}`,
    `Org: ${info.orgId}, Amount: ${info.amountMinor} ${info.currency}, Code: ${info.failureCode}`
  );

  return true;
}

export async function notifyRetryStorm(
  orgId: string,
  details: Record<string, unknown>
): Promise<boolean> {
  if (!isNotificationsEnabled()) return false;

  const emitted = await emitTreasuryEvent({
    orgId,
    type: "ALERT_RAISED",
    entityType: "PayoutAlert",
    entityId: "RETRY_STORM",
    dedupKey: alertDedupKey(orgId, "notify:RETRY_STORM"),
    payload: { alertType: "RETRY_STORM", ...details },
  }).catch(() => false);

  if (!emitted) return false;

  const webhookUrl = getSlackWebhookUrl();
  if (webhookUrl) {
    await postSlackMessage(webhookUrl, buildRetryStormSlackBlocks(orgId, details));
  }

  sendEmailStub(
    `Retry Storm: ${orgId}`,
    `Count: ${details.count}, Threshold: ${details.retryThreshold}`
  );

  return true;
}

function sendEmailStub(subject: string, body: string): void {
  const from = process.env.NOTIFICATION_EMAIL_FROM;
  console.log(
    `[treasury-notifier] EMAIL STUB — from=${from ?? "(not set)"} subject="${subject}" body="${body}"`
  );
}

export {
  buildAlertSlackBlocks as _buildAlertSlackBlocks,
  buildPayoutFailedSlackBlocks as _buildPayoutFailedSlackBlocks,
  buildRetryStormSlackBlocks as _buildRetryStormSlackBlocks,
  isNotificationsEnabled as _isNotificationsEnabled,
};
