"use client";

import { useState, useEffect, useCallback } from "react";

interface SafetyControls {
  payoutsPaused: boolean;
  onchainPaused: boolean;
  providerPaused: Record<string, boolean>;
  railsPaused: Record<string, boolean>;
  reason: string;
  source: string;
}

interface CircuitBreakerStates {
  trippedProviders: string[];
  trippedReconciliation: string[];
  providerMetrics: Record<
    string,
    { successes: number; failures: number; failureRate: number }
  >;
}

interface SafetyData {
  controls: SafetyControls;
  circuitBreakers: CircuitBreakerStates;
  lastReconciliation: { severity: string; checkedAt: string } | null;
  lastSnapshotAt: string | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  INFO: "text-green-600",
  WARN: "text-yellow-600",
  CRITICAL: "text-red-600",
};

const SEVERITY_BG: Record<string, string> = {
  INFO: "bg-green-100",
  WARN: "bg-yellow-100",
  CRITICAL: "bg-red-100",
};

export function TreasuryControlCenterClient({ orgId }: { orgId: string }) {
  const [data, setData] = useState<SafetyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [pauseReason, setPauseReason] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/orgs/${orgId}/treasury/safety`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function doAction(action: string, extra: Record<string, unknown> = {}) {
    setActing(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/treasury/safety`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      if (res.ok) {
        const result = await res.json();
        setData((prev) =>
          prev
            ? {
                ...prev,
                controls: result.controls,
                circuitBreakers: result.circuitBreakers,
              }
            : prev
        );
      }
    } finally {
      setActing(false);
      setConfirmAction(null);
      setPauseReason("");
    }
  }

  if (loading) {
    return (
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-500">Loading control center...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-600">Failed to load safety controls.</p>
      </div>
    );
  }

  const { controls, circuitBreakers, lastReconciliation, lastSnapshotAt } = data;
  const anyPaused = controls.payoutsPaused || controls.onchainPaused;
  const anyTripped =
    circuitBreakers.trippedProviders.length > 0 ||
    circuitBreakers.trippedReconciliation.length > 0;

  const overallStatus = anyPaused ? "paused" : anyTripped ? "degraded" : "healthy";
  const statusColors = {
    healthy: "bg-green-100 text-green-800 border-green-200",
    degraded: "bg-yellow-100 text-yellow-800 border-yellow-200",
    paused: "bg-red-100 text-red-800 border-red-200",
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Treasury Control Center
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Safety controls, circuit breakers, and operational status
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium border ${statusColors[overallStatus]}`}
        >
          {overallStatus.toUpperCase()}
        </span>
      </div>

      {/* Emergency Actions */}
      <div className="mt-4 flex gap-3">
        {!anyPaused ? (
          <button
            onClick={() => setConfirmAction("pause_all")}
            disabled={acting}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Pause All Immediately
          </button>
        ) : (
          <button
            onClick={() => setConfirmAction("resume_all")}
            disabled={acting}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            Resume Operations
          </button>
        )}
        <button
          onClick={fetchData}
          disabled={loading}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">
            {confirmAction === "pause_all"
              ? "Are you sure you want to PAUSE ALL treasury operations?"
              : confirmAction === "resume_all"
                ? "Are you sure you want to RESUME all treasury operations?"
                : `Confirm action: ${confirmAction}?`}
          </p>
          {confirmAction === "pause_all" && (
            <input
              type="text"
              placeholder="Reason for pause (required)"
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              className="mt-2 w-full rounded border border-amber-300 px-3 py-1.5 text-sm"
            />
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                if (confirmAction === "pause_all") {
                  doAction("pause_all", { reason: pauseReason || "Emergency pause" });
                } else if (confirmAction === "resume_all") {
                  doAction("resume_all");
                } else if (confirmAction.startsWith("reset_provider:")) {
                  doAction("reset_provider_breaker", {
                    provider: confirmAction.replace("reset_provider:", ""),
                  });
                } else if (confirmAction === "reset_reconciliation") {
                  doAction("reset_reconciliation_breaker");
                }
              }}
              disabled={acting || (confirmAction === "pause_all" && !pauseReason.trim())}
              className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {acting ? "Processing..." : "Confirm"}
            </button>
            <button
              onClick={() => {
                setConfirmAction(null);
                setPauseReason("");
              }}
              className="rounded border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Safety Controls Status */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ToggleCard
          label="Payouts"
          paused={controls.payoutsPaused}
          onToggle={() =>
            doAction("update", {
              payoutsPaused: !controls.payoutsPaused,
              reason: controls.payoutsPaused ? "Payouts resumed" : "Payouts paused",
            })
          }
          disabled={acting}
        />
        <ToggleCard
          label="On-Chain"
          paused={controls.onchainPaused}
          onToggle={() =>
            doAction("update", {
              onchainPaused: !controls.onchainPaused,
              reason: controls.onchainPaused ? "On-chain resumed" : "On-chain paused",
            })
          }
          disabled={acting}
        />
      </div>

      {/* Provider Controls */}
      {Object.keys(controls.providerPaused).length > 0 && (
        <div className="mt-3">
          <h3 className="text-xs font-medium text-slate-600 uppercase tracking-wider mb-2">
            Providers
          </h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(controls.providerPaused).map(([provider, paused]) => (
              <span
                key={provider}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                  paused ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                }`}
              >
                {provider}: {paused ? "Paused" : "Active"}
              </span>
            ))}
          </div>
        </div>
      )}

      {controls.reason && (
        <p className="mt-2 text-xs text-slate-500">
          Reason: {controls.reason} (source: {controls.source})
        </p>
      )}

      {/* Circuit Breakers */}
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-2">
          Circuit Breakers
        </h3>
        {circuitBreakers.trippedProviders.length === 0 &&
        circuitBreakers.trippedReconciliation.length === 0 ? (
          <p className="text-xs text-green-600">All circuit breakers OK</p>
        ) : (
          <div className="space-y-2">
            {circuitBreakers.trippedProviders.map((p) => (
              <div
                key={p}
                className="flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2"
              >
                <span className="text-xs text-red-700">
                  Provider {p} — TRIPPED
                </span>
                <button
                  onClick={() => setConfirmAction(`reset_provider:${p}`)}
                  className="rounded bg-white border border-red-300 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                >
                  Reset
                </button>
              </div>
            ))}
            {circuitBreakers.trippedReconciliation.map((orgKey) => (
              <div
                key={orgKey}
                className="flex items-center justify-between rounded border border-red-200 bg-red-50 px-3 py-2"
              >
                <span className="text-xs text-red-700">
                  Reconciliation — TRIPPED
                </span>
                <button
                  onClick={() => setConfirmAction("reset_reconciliation")}
                  className="rounded bg-white border border-red-300 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                >
                  Reset
                </button>
              </div>
            ))}
          </div>
        )}

        {Object.keys(circuitBreakers.providerMetrics).length > 0 && (
          <div className="mt-3">
            <h4 className="text-xs font-medium text-slate-600 mb-1">
              Provider Metrics (5-min window)
            </h4>
            <div className="space-y-1">
              {Object.entries(circuitBreakers.providerMetrics).map(
                ([provider, m]) => (
                  <div
                    key={provider}
                    className="flex items-center gap-3 text-xs text-slate-600"
                  >
                    <span className="font-medium w-16">{provider}</span>
                    <span className="text-green-600">
                      {m.successes} OK
                    </span>
                    <span className="text-red-600">
                      {m.failures} fail
                    </span>
                    <span
                      className={
                        m.failureRate > 0.3
                          ? "text-red-600 font-medium"
                          : "text-slate-500"
                      }
                    >
                      ({(m.failureRate * 100).toFixed(0)}%)
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* Reconciliation & Snapshots */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Last Reconciliation
          </h4>
          {lastReconciliation ? (
            <div className="mt-1">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  SEVERITY_BG[lastReconciliation.severity] ?? "bg-slate-100"
                } ${SEVERITY_COLORS[lastReconciliation.severity] ?? "text-slate-600"}`}
              >
                {lastReconciliation.severity}
              </span>
              <p className="mt-1 text-xs text-slate-500">
                {new Date(lastReconciliation.checkedAt).toLocaleString()}
              </p>
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-400">Never run</p>
          )}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Last Snapshot
          </h4>
          {lastSnapshotAt ? (
            <p className="mt-1 text-xs text-slate-600">
              {new Date(lastSnapshotAt).toLocaleString()}
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">No snapshots yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleCard({
  label,
  paused,
  onToggle,
  disabled,
}: {
  label: string;
  paused: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 flex items-center justify-between ${
        paused
          ? "border-red-200 bg-red-50"
          : "border-green-200 bg-green-50"
      }`}
    >
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className={`text-xs ${paused ? "text-red-600" : "text-green-600"}`}>
          {paused ? "PAUSED" : "Active"}
        </p>
      </div>
      <button
        onClick={onToggle}
        disabled={disabled}
        className={`rounded px-3 py-1 text-xs font-medium ${
          paused
            ? "bg-green-600 text-white hover:bg-green-700"
            : "bg-red-100 text-red-700 hover:bg-red-200"
        } disabled:opacity-50`}
      >
        {paused ? "Resume" : "Pause"}
      </button>
    </div>
  );
}
