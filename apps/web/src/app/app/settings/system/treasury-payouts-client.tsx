"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";
import { useTreasuryStream, type TreasuryStreamEvent } from "./use-treasury-stream";

interface PayoutRow {
  id: string;
  status: string;
  amount: number;
  currency: string;
  vendorId: string | null;
  vendorName: string | null;
  provider: string;
  payoutRail: string;
  circlePayoutId: string | null;
  providerPayoutId: string | null;
  onchainTxSig: string | null;
  note: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  riskStatus: string | null;
  riskReasons: string[] | null;
  approvalStatus: string | null;
  approvalReason: string | null;
  createdAt: string;
}

interface RailStatusInfo {
  rail: string;
  enabled: boolean;
  disabledReason: string | null;
  disabledReasonCode: string | null;
}

interface VendorOption {
  id: string;
  name: string;
}

interface TimelineEvent {
  action: string;
  timestamp: string;
  metadata?: Record<string, unknown> | null;
}

const PAYOUT_STATUS_COLORS: Record<string, string> = {
  CREATED: "bg-slate-100 text-slate-700",
  PENDING: "bg-amber-100 text-amber-800",
  SENT_ONCHAIN: "bg-blue-100 text-blue-800",
  PROCESSING: "bg-indigo-100 text-indigo-800",
  COMPLETED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  CANCELED: "bg-gray-100 text-gray-600",
};

const RISK_STATUS_COLORS: Record<string, string> = {
  CLEAR: "bg-green-100 text-green-700",
  REQUIRES_APPROVAL: "bg-amber-100 text-amber-800",
  BLOCKED: "bg-red-100 text-red-700",
};

const DEFAULT_RAIL_OPTIONS: RailStatusInfo[] = [
  { rail: "BANK_WIRE", enabled: true, disabledReason: null, disabledReasonCode: null },
  { rail: "ACH", enabled: false, disabledReason: "Feature flag off", disabledReasonCode: "FEATURE_FLAG_OFF" },
  { rail: "LOCAL", enabled: false, disabledReason: "Feature flag off", disabledReasonCode: "FEATURE_FLAG_OFF" },
];

const RAIL_LABELS: Record<string, string> = {
  BANK_WIRE: "Wire",
  ACH: "ACH",
  LOCAL: "Local",
};

function shortenSig(sig: string): string {
  if (sig.length <= 12) return sig;
  return `${sig.slice(0, 6)}…${sig.slice(-4)}`;
}

export function TreasuryPayoutsClient({ orgId }: { orgId: string }) {
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [selectedRail, setSelectedRail] = useState("BANK_WIRE");
  const [submitting, setSubmitting] = useState(false);
  const [createResult, setCreateResult] = useState<{
    id: string;
    status: string;
    fundingNote?: string;
    riskStatus?: string;
    riskReasons?: string[];
    approvalStatus?: string;
  } | null>(null);

  const [railStatus, setRailStatus] = useState<RailStatusInfo[]>(DEFAULT_RAIL_OPTIONS);

  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [timelinePayoutId, setTimelinePayoutId] = useState<string | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const fetchPayouts = useCallback(async () => {
    try {
      const res = await fetch(`/api/orgs/${orgId}/treasury/payouts`);
      const json = await res.json();
      if (res.ok && Array.isArray(json.payouts)) {
        setPayouts(json.payouts);
      }
    } catch {
      /* ignore */
    }
  }, [orgId]);

  const fetchVendors = useCallback(async () => {
    try {
      const res = await fetch(`/api/orgs/${orgId}/vendors`);
      const json = await res.json();
      if (res.ok && Array.isArray(json)) {
        setVendors(json.map((v: { id: string; name: string }) => ({ id: v.id, name: v.name })));
      } else if (res.ok && Array.isArray(json.vendors)) {
        setVendors(
          json.vendors.map((v: { id: string; name: string }) => ({ id: v.id, name: v.name }))
        );
      }
    } catch {
      /* ignore */
    }
  }, [orgId]);

  const fetchCapabilities = useCallback(async () => {
    try {
      const res = await fetch(`/api/orgs/${orgId}/treasury/capabilities`);
      const json = await res.json();
      if (res.ok && Array.isArray(json.railStatus)) {
        setRailStatus(json.railStatus as RailStatusInfo[]);
      }
    } catch {
      /* ignore */
    }
  }, [orgId]);

  const handleStreamEvent = useCallback(
    (event: TreasuryStreamEvent) => {
      const payoutEvents = [
        "PAYOUT_CREATED",
        "PAYOUT_STATUS_CHANGED",
        "PAYOUT_COMPLETED",
        "PAYOUT_FAILED",
        "PAYOUT_FUNDED_ONCHAIN",
        "PAYOUT_APPROVAL_REQUESTED",
        "PAYOUT_APPROVED",
        "PAYOUT_REJECTED",
        "POLICY_BLOCKED_PAYOUT",
      ];
      if (payoutEvents.includes(event.type)) {
        fetchPayouts();
      }
    },
    [fetchPayouts]
  );

  useTreasuryStream(orgId, handleStreamEvent);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchPayouts(), fetchVendors(), fetchCapabilities()]).finally(
      () => setLoading(false)
    );
  }, [fetchPayouts, fetchVendors, fetchCapabilities]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a valid amount");
      return;
    }
    setSubmitting(true);
    setError("");
    setCreateResult(null);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/treasury/payouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: selectedVendor || undefined,
          amount: parsedAmount,
          currency: "USD",
          note: note || undefined,
          payoutRail: selectedRail,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to create payout");
        return;
      }
      setCreateResult({
        id: json.id,
        status: json.status,
        fundingNote: json.fundingNote,
        riskStatus: json.riskStatus,
        riskReasons: json.riskReasons,
        approvalStatus: json.approvalStatus,
      });
      await fetchPayouts();
    } catch {
      setError("Failed to create payout");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRefresh(payoutId: string) {
    setRefreshingId(payoutId);
    try {
      await fetchWithCsrf(
        `/api/orgs/${orgId}/treasury/payouts/${payoutId}/refresh`,
        { method: "POST", headers: { "Content-Type": "application/json" } }
      );
      await fetchPayouts();
    } catch {
      /* ignore */
    } finally {
      setRefreshingId(null);
    }
  }

  async function handleApprove(payoutId: string) {
    setApprovingId(payoutId);
    try {
      const res = await fetchWithCsrf(
        `/api/orgs/${orgId}/treasury/payouts/${payoutId}/approve`,
        { method: "POST", headers: { "Content-Type": "application/json" } }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to approve");
      }
      await fetchPayouts();
    } catch {
      setError("Failed to approve payout");
    } finally {
      setApprovingId(null);
    }
  }

  async function handleReject(payoutId: string) {
    setRejectingId(payoutId);
    try {
      const res = await fetchWithCsrf(
        `/api/orgs/${orgId}/treasury/payouts/${payoutId}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Rejected via UI" }),
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Failed to reject");
      }
      await fetchPayouts();
    } catch {
      setError("Failed to reject payout");
    } finally {
      setRejectingId(null);
    }
  }

  function closeCreate() {
    setCreateOpen(false);
    setAmount("");
    setNote("");
    setSelectedVendor("");
    setSelectedRail("BANK_WIRE");
    setCreateResult(null);
    setError("");
  }

  async function fetchTimeline(payoutId: string) {
    setTimelinePayoutId(payoutId);
    setTimelineLoading(true);
    setTimelineEvents([]);
    try {
      const res = await fetch(
        `/api/orgs/${orgId}/treasury/payouts/${payoutId}/timeline`
      );
      const json = await res.json();
      if (res.ok && Array.isArray(json.timeline)) {
        setTimelineEvents(json.timeline);
      }
    } catch {
      /* ignore */
    } finally {
      setTimelineLoading(false);
    }
  }

  function closeTimeline() {
    setTimelinePayoutId(null);
    setTimelineEvents([]);
  }

  if (loading) return <p className="mt-4 text-sm text-slate-500">Loading payouts…</p>;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-medium text-slate-900">Payouts (Off-Ramp)</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Send fiat payouts to vendors via supported providers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Create Payout
        </button>
      </div>

      {error && !createOpen && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-lg max-w-md w-full mx-4">
            <h3 className="font-medium text-slate-900">Create Payout</h3>
            {!createResult ? (
              <form onSubmit={handleCreate} className="mt-3 space-y-3">
                <div>
                  <label htmlFor="payout-vendor" className="block text-sm text-slate-600">
                    Vendor (optional)
                  </label>
                  <select
                    id="payout-vendor"
                    value={selectedVendor}
                    onChange={(e) => setSelectedVendor(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">— No vendor —</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="payout-amount" className="block text-sm text-slate-600">
                    Amount (USD)
                  </label>
                  <input
                    id="payout-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="100.00"
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label htmlFor="payout-rail" className="block text-sm text-slate-600">
                    Payout Rail
                  </label>
                  <select
                    id="payout-rail"
                    value={selectedRail}
                    onChange={(e) => setSelectedRail(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  >
                    {railStatus.map((r) => (
                      <option key={r.rail} value={r.rail} disabled={!r.enabled}>
                        {RAIL_LABELS[r.rail] ?? r.rail}
                        {!r.enabled && r.disabledReason
                          ? ` (${r.disabledReason})`
                          : !r.enabled
                            ? " (unavailable)"
                            : ""}
                      </option>
                    ))}
                  </select>
                  {(() => {
                    const current = railStatus.find((r) => r.rail === selectedRail);
                    if (current && !current.enabled && current.disabledReason) {
                      return (
                        <p className="mt-1 text-xs text-amber-600">
                          {current.disabledReason}
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
                <div>
                  <label htmlFor="payout-note" className="block text-sm text-slate-600">
                    Note (optional)
                  </label>
                  <input
                    id="payout-note"
                    type="text"
                    maxLength={500}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Invoice #1234"
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                  />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={closeCreate}
                    className="rounded border border-slate-300 px-3 py-1.5 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    {submitting ? "Creating…" : "Create Payout"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-3 space-y-3 text-sm">
                <p>
                  Payout created:{" "}
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${PAYOUT_STATUS_COLORS[createResult.status] ?? "bg-slate-100 text-slate-700"}`}
                  >
                    {createResult.status}
                  </span>
                </p>
                {createResult.riskStatus && createResult.riskStatus !== "CLEAR" && (
                  <div className="rounded border border-amber-200 bg-amber-50 p-2">
                    <p className="text-xs font-medium text-amber-800">
                      {createResult.riskStatus === "REQUIRES_APPROVAL" ? "Pending Approval" : "Blocked"}
                    </p>
                    {createResult.riskReasons && createResult.riskReasons.length > 0 && (
                      <ul className="mt-1 list-disc list-inside text-xs text-amber-700">
                        {createResult.riskReasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {createResult.fundingNote && (
                  <p className="text-amber-700 text-xs">{createResult.fundingNote}</p>
                )}
                <button
                  type="button"
                  onClick={closeCreate}
                  className="block rounded border border-slate-300 px-3 py-1.5 text-sm"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {payouts.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded border border-slate-200">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-2 py-1.5 text-left font-medium">Vendor</th>
                <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                <th className="px-2 py-1.5 text-left font-medium">Status</th>
                <th className="px-2 py-1.5 text-left font-medium">Risk</th>
                <th className="px-2 py-1.5 text-left font-medium">Provider</th>
                <th className="px-2 py-1.5 text-left font-medium">Rail</th>
                <th className="px-2 py-1.5 text-left font-medium">Note</th>
                <th className="px-2 py-1.5 text-left font-medium">Created</th>
                <th className="px-2 py-1.5 text-left font-medium"></th>
                <th className="px-2 py-1.5 text-left font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5">{p.vendorName ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right font-mono">
                    {p.amount.toFixed(2)} {p.currency}
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${PAYOUT_STATUS_COLORS[p.status] ?? "bg-slate-100 text-slate-700"}`}
                    >
                      {p.status}
                    </span>
                    {p.failureMessage && (
                      <span className="ml-1 text-red-600" title={p.failureMessage}>
                        ({p.failureCode ?? "err"})
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${RISK_STATUS_COLORS[p.riskStatus ?? "CLEAR"] ?? "bg-slate-100 text-slate-700"}`}
                      title={Array.isArray(p.riskReasons) ? p.riskReasons.join("; ") : ""}
                    >
                      {p.riskStatus === "REQUIRES_APPROVAL"
                        ? `NEEDS APPROVAL${p.approvalStatus ? ` (${p.approvalStatus})` : ""}`
                        : p.riskStatus ?? "CLEAR"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="inline-block rounded bg-purple-50 px-1.5 py-0.5 text-xs font-medium text-purple-700">
                      {p.provider}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="inline-block rounded bg-cyan-50 px-1.5 py-0.5 text-xs font-medium text-cyan-700">
                      {RAIL_LABELS[p.payoutRail] ?? p.payoutRail}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 max-w-[120px] truncate" title={p.note ?? ""}>
                    {p.note ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {new Date(p.createdAt).toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1">
                      {p.riskStatus === "REQUIRES_APPROVAL" && p.approvalStatus === "REQUESTED" && (
                        <>
                          <button
                            type="button"
                            disabled={approvingId === p.id}
                            onClick={() => handleApprove(p.id)}
                            className="rounded bg-green-600 px-1.5 py-0.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            {approvingId === p.id ? "…" : "Approve"}
                          </button>
                          <button
                            type="button"
                            disabled={rejectingId === p.id}
                            onClick={() => handleReject(p.id)}
                            className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {rejectingId === p.id ? "…" : "Reject"}
                          </button>
                        </>
                      )}
                      {(p.providerPayoutId || p.circlePayoutId) && p.status !== "COMPLETED" && p.status !== "FAILED" && p.status !== "CANCELED" && (
                        <button
                          type="button"
                          disabled={refreshingId === p.id}
                          onClick={() => handleRefresh(p.id)}
                          className="rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-50"
                        >
                          {refreshingId === p.id ? "…" : "Refresh"}
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => fetchTimeline(p.id)}
                      className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                    >
                      Timeline
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payouts.length === 0 && !loading && (
        <p className="mt-3 text-sm text-slate-500">No payouts yet.</p>
      )}

      {timelinePayoutId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
          <div className="w-full max-w-md bg-white shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="font-medium text-slate-900">Payout Timeline</h3>
              <button
                type="button"
                onClick={closeTimeline}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-4">
              {timelineLoading ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : timelineEvents.length === 0 ? (
                <p className="text-sm text-slate-500">No timeline events.</p>
              ) : (
                <ol className="relative border-l-2 border-slate-200 ml-2 space-y-4">
                  {timelineEvents.map((ev, i) => (
                    <li key={i} className="ml-4">
                      <div className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full border-2 border-white bg-indigo-500" />
                      <p className="text-sm font-medium text-slate-900">
                        {ev.action}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(ev.timestamp).toLocaleString()}
                      </p>
                      {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                        <p className="mt-0.5 text-xs text-slate-400 font-mono truncate" title={JSON.stringify(ev.metadata)}>
                          {JSON.stringify(ev.metadata).slice(0, 80)}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
