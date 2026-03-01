"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

type Connection = {
  status: string;
  realmId: string | null;
  connectedByUserId: string | null;
  lastSyncAt: string | null;
  errorMessage: string | null;
  homeCurrency?: string | null;
  multiCurrencyEnabled?: boolean;
  includeAttachmentLinksInExport?: boolean;
};

type RemoteChange = {
  id: string;
  entityType: string;
  remoteId: string;
  localEntityType: string | null;
  localEntityId: string | null;
  changeType: string;
  detectedAt: string;
  status: string;
  snapshot: object | null;
};

type ExternalAccount = { id: string; remoteId: string; remoteName: string; accountType: string | null };
type Mapping = { id: string; localType: string; localId: string; remoteType: string; remoteId: string; remoteName: string | null };
type Job = { id: string; type: string; status: string; startedAt: string | null; finishedAt: string | null; errorMessage: string | null };
type GLCode = { id: string; code: string; name: string };
type Log = { id: string; level: string; message: string; meta: object | null; createdAt: string };

export function QuickBooksClient({ orgId }: { orgId: string }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [externalAccounts, setExternalAccounts] = useState<ExternalAccount[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [lastJobs, setLastJobs] = useState<Job[]>([]);
  const [glCodes, setGlCodes] = useState<GLCode[]>([]);
  const [remoteChanges, setRemoteChanges] = useState<RemoteChange[]>([]);
  const [blockedInvoices, setBlockedInvoices] = useState<string[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [newMapping, setNewMapping] = useState<{ glCode: string; qboAccountId: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/orgs/${orgId}/accounting/quickbooks`);
    const data = await res.json();
    if (data.error) setError(data.error);
    else {
      setConnection(data.connection);
      setExternalAccounts(data.externalAccounts ?? []);
      setMappings(data.mappings ?? []);
      setLastJobs(data.lastJobs ?? []);
      setGlCodes(data.glCodes ?? []);
      setRemoteChanges(data.remoteChanges ?? []);
      setBlockedInvoices(data.blockedInvoices ?? []);
    }
  }, [orgId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1") setSuccess("Connected to QuickBooks.");
    if (params.get("error")) setError(params.get("error") ?? null);
  }, []);

  const handleConnect = () => {
    window.location.href = `/api/orgs/${orgId}/accounting/quickbooks/connect`;
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect QuickBooks?")) return;
    await fetchWithCsrf(`/api/orgs/${orgId}/accounting/quickbooks/disconnect`, { method: "POST" });
    load();
  };

  const handleSync = async (type: string) => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/accounting/quickbooks/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Sync failed");
      else setSuccess(`Sync job queued: ${type}`);
      load();
    } finally {
      setSyncing(false);
    }
  };

  const handleRetry = async (jobId: string) => {
    await fetchWithCsrf(`/api/orgs/${orgId}/accounting/quickbooks/jobs/${jobId}/retry`, { method: "POST" });
    setSuccess("Job queued for retry");
    load();
  };

  const loadLogs = async () => {
    const res = await fetch(`/api/orgs/${orgId}/accounting/quickbooks/logs?limit=100`);
    const data = await res.json();
    setLogs(data.logs ?? []);
    setShowLogs(true);
  };

  const saveMapping = async () => {
    if (!newMapping?.glCode || !newMapping.qboAccountId) return;
    const account = externalAccounts.find((a) => a.remoteId === newMapping!.qboAccountId);
    const res = await fetchWithCsrf(`/api/orgs/${orgId}/accounting/quickbooks/mappings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        localType: "GL_CODE",
        localId: newMapping.glCode,
        remoteType: "QBO_ACCOUNT",
        remoteId: newMapping.qboAccountId,
        remoteName: account?.remoteName,
      }),
    });
    if (res.ok) {
      setNewMapping(null);
      load();
      setSuccess("Mapping saved");
    }
  };

  const unmappedCount = glCodes.filter((g) => !mappings.some((m) => m.localType === "GL_CODE" && m.localId === g.code)).length;

  const handleAcknowledge = async (changeId: string, action: "acknowledge" | "resolve") => {
    const res = await fetchWithCsrf(`/api/orgs/${orgId}/accounting/quickbooks/remote-changes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changeId, action }),
    });
    if (res.ok) {
      setSuccess(`Change ${action === "acknowledge" ? "acknowledged" : "resolved"}`);
      load();
    }
  };

  const handleAttachmentToggle = async (checked: boolean) => {
    const res = await fetchWithCsrf(`/api/orgs/${orgId}/accounting/quickbooks/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includeAttachmentLinksInExport: checked }),
    });
    if (res.ok) {
      setSuccess("Setting saved");
      load();
    }
  };

  if (loading) return <p className="mt-4 text-sm text-slate-500">Loading…</p>;

  return (
    <div className="mt-6 space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300">
          {success}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Connection</h2>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <p className="text-sm">
              Status: <span className={connection?.status === "CONNECTED" ? "text-green-600" : "text-amber-600"}>{connection?.status ?? "Not connected"}</span>
              {connection?.realmId && <span className="ml-2 text-slate-500">Realm: {connection.realmId}</span>}
            </p>
            {connection?.errorMessage && <p className="mt-1 text-xs text-red-600">{connection.errorMessage}</p>}
            {connection?.lastSyncAt && (
              <p className="mt-1 text-xs text-slate-500">Last sync: {new Date(connection.lastSyncAt).toLocaleString()}</p>
            )}
          </div>
          <div className="flex gap-2">
            {connection?.status === "CONNECTED" ? (
              <button
                type="button"
                onClick={handleDisconnect}
                className="rounded bg-slate-200 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200"
              >
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnect}
                className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
              >
                Connect QuickBooks
              </button>
            )}
          </div>
        </div>
      </div>

      {connection?.status === "CONNECTED" && (
        <>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Currency compatibility</h2>
            <p className="mt-1 text-xs text-slate-500">
              Home currency: {connection?.homeCurrency ?? "—"} | Multi-currency: {connection?.multiCurrencyEnabled ? "Enabled" : "Disabled"}
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Invoices in a different currency than QBO home require multi-currency to be enabled in QuickBooks. Once enabled, multi-currency cannot be turned off.
            </p>
            {blockedInvoices.length > 0 && (
              <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-900/20">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200">Blocked exports ({blockedInvoices.length}):</p>
                <ul className="mt-1 list-inside list-disc text-xs text-amber-700 dark:text-amber-300">
                  {blockedInvoices.slice(0, 5).map((invId) => (
                    <li key={invId}>
                      <a href={`/app/invoices/${invId}`} className="hover:underline">Invoice {invId.slice(0, 8)}…</a>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => handleSync("EXPORT_BILLS")} className="mt-2 text-xs text-amber-700 underline hover:no-underline dark:text-amber-300">
                  Retry export after fixing
                </button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Attachments</h2>
            <p className="mt-1 text-xs text-slate-500">
              Secure links to invoice attachments are added to exported bills&apos; memo. Recipients can view attachments via the link (requires login).
            </p>
            <label className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={connection?.includeAttachmentLinksInExport ?? true}
                onChange={(e) => handleAttachmentToggle(e.target.checked)}
              />
              <span className="text-sm">Include secure attachment links in exported bills</span>
            </label>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Reference sync</h2>
            <p className="mt-1 text-xs text-slate-500">Import Chart of Accounts for GL dropdowns.</p>
            <button
              type="button"
              onClick={() => handleSync("IMPORT_REFERENCE")}
              disabled={syncing}
              className="mt-3 rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              {syncing ? "Queuing…" : "Sync reference data"}
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">GL code mapping</h2>
            <p className="mt-1 text-xs text-slate-500">
              Map your GL codes to QBO accounts. Unmapped: {unmappedCount}
            </p>
            {externalAccounts.length === 0 && (
              <p className="mt-2 text-xs text-amber-600">Run &quot;Sync reference data&quot; first to load QBO accounts.</p>
            )}
            {newMapping ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  value={newMapping.glCode}
                  onChange={(e) => setNewMapping((n) => (n ? { ...n, glCode: e.target.value } : null))}
                  className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                >
                  <option value="">Select GL code</option>
                  {glCodes.map((g) => (
                    <option key={g.id} value={g.code}>{g.code} – {g.name}</option>
                  ))}
                </select>
                <select
                  value={newMapping.qboAccountId}
                  onChange={(e) => setNewMapping((n) => (n ? { ...n, qboAccountId: e.target.value } : null))}
                  className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                >
                  <option value="">Select QBO account</option>
                  {externalAccounts.map((a) => (
                    <option key={a.id} value={a.remoteId}>{a.remoteName} ({a.remoteId})</option>
                  ))}
                </select>
                <button type="button" onClick={saveMapping} className="rounded bg-slate-900 px-2 py-1 text-sm text-white dark:bg-slate-100 dark:text-slate-900">
                  Save
                </button>
                <button type="button" onClick={() => setNewMapping(null)} className="text-sm text-slate-600 dark:text-slate-400">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setNewMapping({ glCode: glCodes[0]?.code ?? "", qboAccountId: externalAccounts[0]?.remoteId ?? "" })}
                className="mt-3 rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600"
              >
                Add mapping
              </button>
            )}
            <div className="mt-3 max-h-48 overflow-y-auto rounded border border-slate-200 dark:border-slate-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                    <th className="px-3 py-2 text-left">Local GL code</th>
                    <th className="px-3 py-2 text-left">QBO account</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.filter((m) => m.localType === "GL_CODE").map((m) => (
                    <tr key={m.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2">{m.localId}</td>
                      <td className="px-3 py-2">{m.remoteName ?? m.remoteId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Export</h2>
            <p className="mt-1 text-xs text-slate-500">Export verified invoices and payments to QBO.</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => handleSync("EXPORT_BILLS")}
                disabled={syncing}
                className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
              >
                Sync bills
              </button>
              <button
                type="button"
                onClick={() => handleSync("EXPORT_PAYMENTS")}
                disabled={syncing}
                className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
              >
                Sync payments
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Sync jobs</h2>
            <div className="mt-2 max-h-40 overflow-y-auto space-y-2">
              {lastJobs.length === 0 ? (
                <p className="text-xs text-slate-500">No jobs yet.</p>
              ) : (
                lastJobs.map((j) => (
                  <div key={j.id} className="flex items-center justify-between rounded border border-slate-200 p-2 dark:border-slate-700">
                    <span className="text-sm">{j.type} – {j.status}</span>
                    <span className="text-xs text-slate-500">
                      {j.finishedAt ? new Date(j.finishedAt).toLocaleString() : j.startedAt ? "Running" : "Pending"}
                    </span>
                    {j.status === "FAILED" && (
                      <button type="button" onClick={() => handleRetry(j.id)} className="text-xs text-amber-600 hover:underline">
                        Retry
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={loadLogs}
              className="mt-3 text-sm text-slate-600 hover:underline dark:text-slate-400"
            >
              View logs
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Remote changes</h2>
            <p className="mt-1 text-xs text-slate-500">
              Changes made in QuickBooks to bills we exported. Review and reconcile manually if needed.
            </p>
            {remoteChanges.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">No remote changes.</p>
            ) : (
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                {remoteChanges.map((rc) => (
                  <div key={rc.id} className="flex items-center justify-between rounded border border-slate-200 p-2 dark:border-slate-700">
                    <span className="text-sm">
                      {rc.entityType} {rc.remoteId} – {rc.changeType} ({rc.status})
                    </span>
                    {rc.status === "OPEN" && (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => handleAcknowledge(rc.id, "acknowledge")} className="text-xs text-slate-600 hover:underline dark:text-slate-400">
                          Acknowledge
                        </button>
                        <button type="button" onClick={() => handleAcknowledge(rc.id, "resolve")} className="text-xs text-slate-600 hover:underline dark:text-slate-400">
                          Resolve
                        </button>
                      </div>
                    )}
                    {rc.localEntityId && rc.entityType === "BILL" && (
                      <a href={`/app/invoices/${rc.localEntityId}`} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                        View invoice
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {showLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowLogs(false)}>
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between">
              <h3 className="text-lg font-semibold">Sync logs</h3>
              <button onClick={() => setShowLogs(false)} className="text-slate-500">×</button>
            </div>
            <pre className="mt-4 max-h-96 overflow-auto rounded border border-slate-200 p-4 text-xs dark:border-slate-700">
              {logs.map((l) => (
                <div key={l.id} className={l.level === "ERROR" ? "text-red-600" : l.level === "WARN" ? "text-amber-600" : ""}>
                  [{new Date(l.createdAt).toISOString()}] [{l.level}] {l.message}
                </div>
              ))}
            </pre>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([JSON.stringify(logs)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "accounting-sync-logs.json";
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="mt-2 text-sm text-slate-600 hover:underline dark:text-slate-400"
            >
              Download logs JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
