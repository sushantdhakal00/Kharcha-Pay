"use client";

import { useState, useEffect } from "react";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";
import { useReauth } from "@/components/csrf-and-reauth-provider";

const MIN_DAYS = 30;
const MAX_DAYS = 3650;

export function AuditRetentionClient({ orgId }: { orgId: string }) {
  const reauth = useReauth();
  const [retentionDays, setRetentionDays] = useState(365);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ deletedCount: number; retentionDays: number } | null>(null);

  useEffect(() => {
    fetch(`/api/orgs/${orgId}/audit-retention`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setRetentionDays(data.retentionDays ?? 365);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [orgId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setRunResult(null);
    const days = parseInt(String(retentionDays), 10);
    if (isNaN(days) || days < MIN_DAYS || days > MAX_DAYS) {
      setError(`Retention must be between ${MIN_DAYS} and ${MAX_DAYS} days`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/audit-retention`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retentionDays: days }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "REAUTH_REQUIRED" && reauth) {
          reauth.showReauth(() => Promise.resolve());
          return;
        }
        setError(data.error ?? "Failed to save");
        return;
      }
      setRetentionDays(data.retentionDays);
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleRunCleanup() {
    setError("");
    setRunResult(null);
    setRunning(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/audit-retention/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "REAUTH_REQUIRED" && reauth) {
          reauth.showReauth(() => Promise.resolve());
          return;
        }
        setError(data.error ?? "Cleanup failed");
        return;
      }
      setRunResult({ deletedCount: data.deletedCount ?? 0, retentionDays: data.retentionDays ?? retentionDays });
    } catch {
      setError("Cleanup failed");
    } finally {
      setRunning(false);
    }
  }

  if (loading) return <p className="mt-4 text-sm text-slate-600">Loading…</p>;

  return (
    <div className="mt-4 space-y-6">
      <form onSubmit={handleSave} className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Retention (days)</label>
          <input
            type="number"
            min={MIN_DAYS}
            max={MAX_DAYS}
            value={retentionDays}
            onChange={(e) => setRetentionDays(parseInt(e.target.value, 10) || MIN_DAYS)}
            className="mt-1 w-32 rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
          <p className="mt-1 text-xs text-slate-500">{MIN_DAYS}–{MAX_DAYS} days</p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="border-t border-slate-200 pt-4">
        <h2 className="font-medium text-slate-900">Run cleanup now</h2>
        <p className="mt-1 text-sm text-slate-600">
          Delete audit events older than the retention period. This is logged as an audit event.
        </p>
        <button
          type="button"
          onClick={handleRunCleanup}
          disabled={running}
          className="mt-3 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {running ? "Running…" : "Run cleanup now"}
        </button>
        {runResult != null && (
          <p className="mt-2 text-sm text-slate-600">
            Deleted {runResult.deletedCount} event(s) older than {runResult.retentionDays} days.
          </p>
        )}
      </div>
    </div>
  );
}
