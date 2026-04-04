"use client";

import { useState, useEffect, useCallback } from "react";
import { useTreasuryStream, type TreasuryStreamEvent } from "./use-treasury-stream";

interface PayoutMetrics {
  successRate: number;
  avgCompletionMs: number;
  totalVolumeUsd: number;
  failureBreakdown: Array<{ failureCode: string; count: number }>;
  dailyVolumeSeries: Array<{ date: string; volumeUsd: number; count: number }>;
  windowDays: number;
}

function formatMs(ms: number): string {
  if (ms === 0) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function TreasuryInsightsClient({ orgId }: { orgId: string }) {
  const [metrics, setMetrics] = useState<PayoutMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/orgs/${orgId}/treasury/metrics?windowDays=30`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load metrics");
        return;
      }
      setMetrics(data);
    } catch {
      setError("Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const handleStreamEvent = useCallback(
    (event: TreasuryStreamEvent) => {
      if (
        event.type === "PAYOUT_COMPLETED" ||
        event.type === "PAYOUT_FAILED"
      ) {
        fetchMetrics();
      }
    },
    [fetchMetrics]
  );

  useTreasuryStream(orgId, handleStreamEvent);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (loading) {
    return <p className="mt-4 text-sm text-slate-500">Loading payout insights…</p>;
  }
  if (error) {
    return <p className="mt-4 text-sm text-red-600">{error}</p>;
  }
  if (!metrics) return null;

  const failureRate = metrics.successRate < 1 ? 1 - metrics.successRate : 0;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium text-slate-900">Payout Insights</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Last {metrics.windowDays} days
          </p>
        </div>
        <button
          type="button"
          onClick={fetchMetrics}
          className="rounded bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-300"
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Success Rate"
          value={formatPct(metrics.successRate)}
          accent={metrics.successRate >= 0.9 ? "green" : metrics.successRate >= 0.7 ? "amber" : "red"}
        />
        <MetricCard
          title="Avg Completion"
          value={formatMs(metrics.avgCompletionMs)}
          accent="blue"
        />
        <MetricCard
          title="Total Volume (30d)"
          value={formatUsd(metrics.totalVolumeUsd)}
          accent="indigo"
        />
        <MetricCard
          title="Failure Rate"
          value={formatPct(failureRate)}
          accent={failureRate <= 0.05 ? "green" : failureRate <= 0.15 ? "amber" : "red"}
        />
      </div>

      {metrics.failureBreakdown.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-slate-700">Failure Breakdown</h3>
          <div className="mt-2 space-y-1">
            {metrics.failureBreakdown.map((f) => (
              <div
                key={f.failureCode}
                className="flex items-center justify-between text-sm"
              >
                <span className="font-mono text-slate-600">{f.failureCode}</span>
                <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                  {f.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {metrics.dailyVolumeSeries.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-slate-700">Daily Volume</h3>
          <div className="mt-2 flex items-end gap-px" style={{ height: 80 }}>
            {(() => {
              const maxVol = Math.max(
                ...metrics.dailyVolumeSeries.map((d) => d.volumeUsd),
                1
              );
              return metrics.dailyVolumeSeries.slice(-14).map((d) => (
                <div
                  key={d.date}
                  className="flex-1 rounded-t bg-indigo-400 hover:bg-indigo-500 transition-colors"
                  style={{
                    height: `${Math.max((d.volumeUsd / maxVol) * 100, 2)}%`,
                  }}
                  title={`${d.date}: ${formatUsd(d.volumeUsd)} (${d.count} payouts)`}
                />
              ));
            })()}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>
              {metrics.dailyVolumeSeries.slice(-14)[0]?.date ?? ""}
            </span>
            <span>
              {metrics.dailyVolumeSeries[metrics.dailyVolumeSeries.length - 1]?.date ?? ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  accent,
}: {
  title: string;
  value: string;
  accent: "green" | "amber" | "red" | "blue" | "indigo";
}) {
  const borderColor = {
    green: "border-l-emerald-500",
    amber: "border-l-amber-500",
    red: "border-l-red-500",
    blue: "border-l-blue-500",
    indigo: "border-l-indigo-500",
  }[accent];

  return (
    <div
      className={`rounded-lg border border-slate-200 border-l-4 ${borderColor} bg-white p-4`}
    >
      <p className="text-sm text-slate-600">{title}</p>
      <p className="mt-1 text-lg font-semibold font-mono">{value}</p>
    </div>
  );
}
