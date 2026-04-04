/**
 * Map QBO API errors to friendly guidance for users.
 */
export function mapQboErrorToGuidance(error: Error): { message: string; fixHint?: string } {
  const msg = error.message.toLowerCase();

  if (msg.includes("accountref") || msg.includes("account ref")) {
    return {
      message: "AccountRef missing mapping",
      fixHint: "Map the invoice's GL code to a QBO account in Settings → Integrations → QuickBooks.",
    };
  }
  if (msg.includes("vendor") && (msg.includes("not found") || msg.includes("inactive"))) {
    return {
      message: "Vendor not found or inactive",
      fixHint: "Ensure the vendor exists and is active in QuickBooks, or reconnect the integration.",
    };
  }
  if (msg.includes("currency") || msg.includes("multi.currency")) {
    return {
      message: "Currency mismatch",
      fixHint: "Enable multi-currency in QuickBooks, or export invoices in your QBO home currency.",
    };
  }
  if (msg.includes("unauthorized") || msg.includes("401") || msg.includes("token") || msg.includes("expired")) {
    return {
      message: "Auth expired; reconnect",
      fixHint: "Disconnect and reconnect QuickBooks in Settings → Integrations.",
    };
  }
  if (msg.includes("qbo_unauthorized")) {
    return {
      message: "Auth expired; reconnect",
      fixHint: "Disconnect and reconnect QuickBooks in Settings → Integrations.",
    };
  }

  return {
    message: error.message,
    fixHint: "Check the sync logs and fix any mapping or data issues, then retry.",
  };
}
