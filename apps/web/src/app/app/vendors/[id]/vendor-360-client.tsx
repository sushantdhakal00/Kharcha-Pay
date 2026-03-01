"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

interface Vendor360Data {
  vendor: {
    id: string;
    name: string;
    displayName: string;
    status: string;
    riskLevel: string;
    contactEmail: string | null;
    contactPhone: string | null;
    legalName: string | null;
    taxId: string | null;
  };
  contacts: Array<{ id: string; name: string; email: string | null; isPrimary: boolean }>;
  paymentMethods: Array<{
    id: string;
    type: string;
    bankAccountMasked: string | null;
    bankName: string | null;
    status: string;
  }>;
  documents: Array<{ id: string; type: string; fileName: string; status: string }>;
  onboardingCases: Array<{
    id: string;
    status: string;
    ownerUserId: string | null;
    dueAt: string | null;
    checklist: unknown;
  }>;
  spend: { last30Minor: string; concentrationPct: number };
  counts: { invoices: number; purchaseOrders: number; requests: number };
  auditEvents: Array<{ id: string; action: string; createdAt: string }>;
}

type TabId = "overview" | "onboarding" | "documents" | "payment" | "activity";

export function Vendor360Client({
  orgId,
  vendorId,
  isAdmin,
  isApprover,
  canWrite,
}: {
  orgId: string;
  vendorId: string;
  isAdmin: boolean;
  isApprover: boolean;
  canWrite: boolean;
}) {
  const [data, setData] = useState<Vendor360Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<TabId>("overview");
  const [actioning, setActioning] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/orgs/${orgId}/vendors/${vendorId}/detail`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [orgId, vendorId]);

  useEffect(() => {
    load();
  }, [load]);

  async function startOnboarding() {
    setActioning(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/vendors/${vendorId}/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      if (res.ok) load();
    } finally {
      setActioning(false);
    }
  }

  async function activateVendor() {
    if (!confirm("Activate this vendor? They will be available for payments.")) return;
    setActioning(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/vendors/${vendorId}/onboarding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate" }),
      });
      const d = await res.json();
      if (res.ok) load();
      else alert(d.error ?? "Failed to activate");
    } finally {
      setActioning(false);
    }
  }

  if (loading) return <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  if (error || !data) return <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error || "Not found"}</p>;

  const v = data.vendor;
  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "onboarding", label: "Onboarding" },
    { id: "documents", label: "Documents" },
    { id: "payment", label: "Payment methods" },
    { id: "activity", label: "Activity" },
  ];

  return (
    <div className="mt-4">
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.id
                ? "border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
                : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        {tab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
              <div>
                <p className="text-slate-500 dark:text-slate-400">Status</p>
                <p className="font-medium">{v.status}</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Risk</p>
                <p className="font-medium">{v.riskLevel}</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Primary contact</p>
                <p className="font-medium">
                  {data.contacts.find((c) => c.isPrimary)?.name ??
                    data.contacts[0]?.name ??
                    v.contactEmail ??
                    "—"}
                </p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Payment method</p>
                <p className="font-medium">
                  {data.paymentMethods.some((p) => p.status === "VERIFIED")
                    ? "Verified"
                    : "Unverified"}
                </p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Spend (30d)</p>
                <p className="font-mono">{Number(data.spend.last30Minor) / 100}</p>
              </div>
              <div>
                <p className="text-slate-500 dark:text-slate-400">Concentration</p>
                <p className="font-mono">{data.spend.concentrationPct.toFixed(1)}%</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Invoices: {data.counts.invoices} | POs: {data.counts.purchaseOrders} | Requests:{" "}
              {data.counts.requests}
            </p>
            {v.status === "ONBOARDING" && isApprover && (
              <button
                type="button"
                onClick={activateVendor}
                disabled={actioning}
                className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
              >
                {actioning ? "Activating…" : "Activate vendor"}
              </button>
            )}
          </div>
        )}

        {tab === "onboarding" && (
          <div className="space-y-4">
            {data.onboardingCases.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                No onboarding case.{" "}
                {canWrite && v.status !== "ACTIVE" && (
                  <button
                    type="button"
                    onClick={startOnboarding}
                    disabled={actioning}
                    className="text-slate-900 underline hover:no-underline dark:text-slate-100"
                  >
                    Start onboarding
                  </button>
                )}
              </p>
            ) : (
              <div>
                {data.onboardingCases.map((c) => (
                  <div key={c.id} className="rounded border border-slate-200 p-3 dark:border-slate-600">
                    <p className="font-medium">Status: {c.status}</p>
                    {c.dueAt && (
                      <p className="text-sm text-slate-500">Due: {new Date(c.dueAt).toLocaleDateString()}</p>
                    )}
                    {Array.isArray(c.checklist) &&
                      (c.checklist as Array<{ id: string; label: string; completedAt: string | null }>).map(
                        (step) => (
                          <div key={step.id} className="mt-2 flex items-center gap-2 text-sm">
                            <span className={step.completedAt ? "text-green-600" : "text-slate-400"}>
                              {step.completedAt ? "✓" : "○"}
                            </span>
                            {step.label}
                          </div>
                        )
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "documents" && (
          <div className="space-y-2">
            {data.documents.length === 0 ? (
              <p className="text-sm text-slate-500">No documents uploaded.</p>
            ) : (
              data.documents.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded border border-slate-200 py-2 px-3 dark:border-slate-600"
                >
                  <span className="text-sm">
                    {d.type} — {d.fileName}
                  </span>
                  <span
                    className={
                      d.status === "VERIFIED"
                        ? "text-green-600 dark:text-green-400"
                        : d.status === "REJECTED"
                          ? "text-red-600 dark:text-red-400"
                          : "text-amber-600 dark:text-amber-400"
                    }
                  >
                    {d.status}
                  </span>
                </div>
              ))
            )}
            {canWrite && (
              <p className="mt-4 text-xs text-slate-500">
                Use Documents tab to upload. Approvers can verify/reject.
              </p>
            )}
          </div>
        )}

        {tab === "payment" && (
          <div className="space-y-2">
            {data.paymentMethods.length === 0 ? (
              <p className="text-sm text-slate-500">No payment method on file.</p>
            ) : (
              data.paymentMethods.map((p) => (
                <div
                  key={p.id}
                  className="rounded border border-slate-200 py-2 px-3 dark:border-slate-600"
                >
                  <p className="text-sm font-medium">
                    {p.bankAccountMasked ?? "—"} • {p.bankName ?? "—"}
                  </p>
                  <p className="text-xs text-slate-500">{p.status}</p>
                </div>
              ))
            )}
            {canWrite && (
              <p className="mt-4 text-xs text-slate-500">
                Request bank change via onboarding flow. Dual approval may be required.
              </p>
            )}
          </div>
        )}

        {tab === "activity" && (
          <div className="space-y-1">
            {data.auditEvents.length === 0 ? (
              <p className="text-sm text-slate-500">No activity yet.</p>
            ) : (
              data.auditEvents.map((e) => (
                <div key={e.id} className="flex gap-2 text-sm">
                  <span className="text-slate-500">{e.action}</span>
                  <span className="text-slate-400">{new Date(e.createdAt).toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
