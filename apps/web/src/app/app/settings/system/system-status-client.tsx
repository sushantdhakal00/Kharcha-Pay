"use client";

import { useState, useEffect, useCallback } from "react";

interface SystemStatus {
  db: { ok: boolean };
  redis: { ok: boolean | "skipped" };
  cron: Record<string, { lastRunAt: string; lastResult: Record<string, unknown> | null }>;
  outbox: { pending: number };
  webhook: {
    deadLetters: number;
    successRate24h: number;
    total24h: number;
  };
  qbo: {
    lastSuccessAt: string | null;
    blockedExportsCount: number;
  };
  sse: { activeConnections: string };
}

export function SystemStatusClient({ orgId }: { orgId: string }) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/ops/system-status?orgId=${encodeURIComponent(orgId)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load status");
        return;
      }
      setStatus(data);
    } catch {
      setError("Failed to load status");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (loading) return <p className="mt-4 text-sm text-slate-500">Loading…</p>;
  if (error) return <p className="mt-4 text-sm text-red-600">{error}</p>;
  if (!status) return null;

  const ok = (v: boolean | "skipped") =>
    v === true ? "OK" : v === "skipped" ? "—" : "Error";

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatusCard title="DB" value={ok(status.db.ok)} />
        <StatusCard title="Redis" value={ok(status.redis.ok)} />
        <StatusCard title="Outbox backlog" value={String(status.outbox.pending)} />
        <StatusCard title="Webhook dead letters" value={String(status.webhook.deadLetters)} />
        <StatusCard title="Webhook success (24h)" value={`${status.webhook.successRate24h}%`} />
        <StatusCard title="QBO last success" value={status.qbo.lastSuccessAt ? new Date(status.qbo.lastSuccessAt).toLocaleString() : "—"} />
        <StatusCard title="QBO blocked exports" value={String(status.qbo.blockedExportsCount)} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-medium text-slate-900">Cron last run</h2>
        <div className="mt-2 space-y-1 text-sm">
          {Object.entries(status.cron).map(([type, v]) => (
            <div key={type} className="flex justify-between">
              <span className="text-slate-600">{type}</span>
              <span>{new Date(v.lastRunAt).toLocaleString()} {v.lastResult && `(${JSON.stringify(v.lastResult).slice(0, 60)}…)`}</span>
            </div>
          ))}
          {Object.keys(status.cron).length === 0 && <p className="text-slate-500">No cron runs recorded</p>}
        </div>
      </div>

      <button
        type="button"
        onClick={fetchStatus}
        className="rounded bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-300"
      >
        Refresh
      </button>
    </div>
  );
}

function StatusCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-600">{title}</p>
      <p className="mt-1 font-mono font-medium">{value}</p>
    </div>
  );
}
