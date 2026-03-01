"use client";

import { useState, useEffect } from "react";

interface TreasuryHealthStatus {
  ok: boolean;
  status: "healthy" | "degraded" | "paused";
  lastReconciliation?: { maxSeverity: string; checkedAt: string } | null;
  safetyControls?: Array<{
    payoutsPaused: boolean;
    onchainPaused: boolean;
  }>;
}

const STATUS_STYLES = {
  healthy: {
    bg: "bg-green-50 border-green-200",
    dot: "bg-green-500",
    text: "text-green-700",
    label: "Healthy",
  },
  degraded: {
    bg: "bg-yellow-50 border-yellow-200",
    dot: "bg-yellow-500",
    text: "text-yellow-700",
    label: "Degraded",
  },
  paused: {
    bg: "bg-red-50 border-red-200",
    dot: "bg-red-500",
    text: "text-red-700",
    label: "Paused",
  },
} as const;

export function TreasuryStatusBanner() {
  const [status, setStatus] = useState<TreasuryHealthStatus | null>(null);

  useEffect(() => {
    let mounted = true;

    async function check() {
      try {
        const res = await fetch("/api/health/treasury");
        if (res.ok && mounted) {
          setStatus(await res.json());
        }
      } catch {
        /* non-critical */
      }
    }

    check();
    const interval = setInterval(check, 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!status || status.status === "healthy") return null;

  const style = STATUS_STYLES[status.status];

  return (
    <div
      className={`flex items-center gap-2 border-b px-4 py-1.5 text-xs ${style.bg}`}
    >
      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
      <span className={`font-medium ${style.text}`}>
        Treasury: {style.label}
      </span>
      {status.lastReconciliation && (
        <span className="text-slate-500 ml-2">
          Last reconciliation: {status.lastReconciliation.maxSeverity}
        </span>
      )}
    </div>
  );
}

export function TreasuryStatusIndicator() {
  const [status, setStatus] = useState<"healthy" | "degraded" | "paused">(
    "healthy"
  );

  useEffect(() => {
    let mounted = true;

    async function check() {
      try {
        const res = await fetch("/api/health/treasury");
        if (res.ok && mounted) {
          const data = await res.json();
          setStatus(data.status ?? "healthy");
        }
      } catch {
        /* non-critical */
      }
    }

    check();
    const interval = setInterval(check, 60_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const dotColor =
    status === "healthy"
      ? "bg-green-500"
      : status === "degraded"
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${dotColor}`}
      title={`Treasury: ${status}`}
    />
  );
}
