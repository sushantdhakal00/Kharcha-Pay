"use client";

import { useState, useEffect, useCallback } from "react";

interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorUsername: string | null;
  summary: string;
  createdAt: string;
}

const ACTIONS = ["ORG_CREATED", "MEMBER_ADDED", "DEPT_CREATED", "BUDGET_UPSERTED", "REQUEST_CREATED", "REQUEST_UPDATED", "RECEIPT_UPLOADED", "REQUEST_SUBMITTED", "REQUEST_APPROVED", "REQUEST_REJECTED", "VENDOR_CREATED", "VENDOR_WALLET_SET", "REQUEST_PAID"];
const ENTITY_TYPES = ["Organization", "Membership", "Department", "MonthlyBudget", "ExpenseRequest", "Vendor"];

export function AuditClient({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const fetchEvents = useCallback(
    async (cursor?: string, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (entityType) params.set("entityType", entityType);
      if (action) params.set("action", action);
      if (actorUserId) params.set("actorUserId", actorUserId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("limit", "50");
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/orgs/${orgId}/audit?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to load audit");
        setEvents([]);
        setNextCursor(null);
      } else {
        if (append) {
          setEvents((prev) => [...prev, ...data.events]);
        } else {
          setEvents(data.events ?? []);
        }
        setNextCursor(data.nextCursor ?? null);
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [orgId, entityType, action, actorUserId, from, to]
  );

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleApply = () => fetchEvents();
  const handleLoadMore = () => nextCursor && fetchEvents(nextCursor, true);

  const buildExportUrl = () => {
    const params = new URLSearchParams();
    if (entityType) params.set("entityType", entityType);
    if (action) params.set("action", action);
    if (actorUserId) params.set("actorUserId", actorUserId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/api/orgs/${orgId}/exports/audit?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Audit log</h1>
          <p className="text-sm text-slate-600">Append-only, immutable record of key finance actions.</p>
        </div>
        {isAdmin && (
          <a
            href={buildExportUrl()}
            download="audit-export.csv"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Export CSV
          </a>
        )}
      </div>

      <div className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div>
          <label className="block text-xs font-medium text-slate-600">Entity type</label>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Action</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Actor user ID</label>
          <input
            type="text"
            value={actorUserId}
            onChange={(e) => setActorUserId(e.target.value)}
            placeholder="Optional"
            className="mt-1 w-40 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">From date</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">To date</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={handleApply}
            disabled={loading}
            className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-2 text-left font-medium text-slate-700">Time</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700">Actor</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700">Action</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700">Entity</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700">Summary</th>
            </tr>
          </thead>
          <tbody>
            {loading && events.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading…</td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">No audit events</td>
              </tr>
            ) : (
              events.map((e) => (
                <tr key={e.id} className="border-b border-slate-100">
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-slate-700">{e.actorUsername ?? "System"}</td>
                  <td className="px-4 py-2 font-medium text-slate-900">{e.action}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {e.entityType} {e.entityId.slice(0, 8)}…
                  </td>
                  <td className="px-4 py-2 text-slate-700">{e.summary}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {nextCursor && (
          <div className="border-t border-slate-200 p-3 text-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
