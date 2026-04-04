"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";
import { useReauth } from "@/components/csrf-and-reauth-provider";

interface DemoStatus {
  exists: boolean;
  demoOrgId: string | null;
  demoOrgName?: string;
  seedVersion?: number;
  counts?: {
    requests: number;
    vendors: number;
    paid: number;
    verified: number;
    failed: number;
  };
  done?: {
    budgets: boolean;
    createRequest: boolean;
    approvals: boolean;
    pay: boolean;
    reconcile: boolean;
    receipts: boolean;
  };
}

const checklist = [
  { id: "budgets", label: "Budgets", href: "/app/settings/budgets", doneKey: "budgets" as const },
  { id: "create", label: "Create / submit request", href: "/app/requests/new", doneKey: "createRequest" as const },
  { id: "approvals", label: "Approvals (multi-approver)", href: "/app/requests", doneKey: "approvals" as const },
  { id: "pay", label: "Pay (shows reauth)", href: "/app/payments", doneKey: "pay" as const },
  { id: "reconcile", label: "Reconcile / verify (statuses + reasons)", href: "/app/payments", doneKey: "reconcile" as const },
  { id: "receipts", label: "Receipts compliance (access-controlled download)", href: "/app/requests", doneKey: "receipts" as const },
  { id: "exports", label: "Exports (CSV with verification fields)", href: "/app/reports", doneKey: "pay" as const },
  { id: "auditor", label: "Auditor view (read-only compliance)", href: "/app/audit", doneKey: "approvals" as const },
];

export function DemoClient() {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reauth = useReauth();

  const refresh = () => {
    setLoading(true);
    setError(null);
    fetch("/api/demo/status", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setStatus(data);
      })
      .catch(() => setError("Failed to load demo status"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleStartDemo = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetchWithCsrf("/api/demo/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to start demo");
        return;
      }
      await fetchWithCsrf("/api/me/active-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: data.demoOrgId }),
      });
      window.location.href = "/app";
    } catch {
      setError("Failed to start demo");
    } finally {
      setStarting(false);
    }
  };

  const handleReset = async () => {
    setError(null);
    const doReset = async () => {
      setResetting(true);
      try {
        const res = await fetchWithCsrf("/api/demo/reset", { method: "POST" });
        const data = await res.json();
        if (!res.ok) {
          if (data.code === "REAUTH_REQUIRED") {
            reauth?.showReauth(doReset);
            return;
          }
          setError(data.error ?? "Failed to reset demo");
          return;
        }
        refresh();
      } finally {
        setResetting(false);
      }
    };
    await doReset();
  };

  if (loading) {
    return (
      <div className="max-w-2xl">
        <p className="text-slate-600">Loading demo status…</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Demo Workspace</h1>
      <p className="text-slate-600">
        {status?.exists
          ? "Your demo org has pre-seeded data. Use the checklist to explore every major feature. In demo mode, verification results are simulated."
          : "Start a demo to get a sandbox org with sample budgets, vendors, requests (DRAFT, PENDING, APPROVED, REJECTED, PAID), and simulated reconciliation results."}
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {!status?.exists ? (
        <div>
          <button
            onClick={handleStartDemo}
            disabled={starting}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {starting ? "Starting…" : "Start Demo"}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/app"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Go to Dashboard
            </Link>
            <button
              onClick={handleReset}
              disabled={resetting}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              {resetting ? "Resetting…" : "Reset Demo"}
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="font-medium text-slate-900">Walkthrough checklist</h2>
            <p className="mt-1 text-sm text-slate-600">
              Each step links to the relevant page. Done = already visible in your demo data.
            </p>
            <ul className="mt-4 space-y-3">
              {checklist.map((step) => {
                const done = status?.done?.[step.doneKey] ?? false;
                return (
                  <li key={step.id} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className={done ? "text-green-600" : "text-slate-400"}>
                        {done ? "✓" : "○"}
                      </span>
                      <span className="text-slate-900">{step.label}</span>
                    </div>
                    <Link
                      href={step.href}
                      className="text-sm font-medium text-slate-900 hover:underline"
                    >
                      Go
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {status?.counts && (
            <p className="text-sm text-slate-500">
              Demo has {status.counts.requests} requests, {status.counts.vendors} vendors,{" "}
              {status.counts.paid} paid, {status.counts.verified} verified, {status.counts.failed} failed.
            </p>
          )}
        </>
      )}
    </div>
  );
}
