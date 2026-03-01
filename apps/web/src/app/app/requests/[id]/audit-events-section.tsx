"use client";

import { useState, useEffect } from "react";

interface AuditEvent {
  id: string;
  action: string;
  actorUsername: string | null;
  summary: string;
  createdAt: string;
}

export function AuditEventsSection({ orgId, requestId }: { orgId: string; requestId: string }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("entityType", "ExpenseRequest");
    params.set("entityId", requestId);
    params.set("limit", "20");

    fetch(`/api/orgs/${orgId}/audit?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setEvents(data.events ?? []);
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [orgId, requestId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Audit trail</h2>
        <p className="mt-2 text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Audit trail</h2>
        <p className="mt-2 text-sm text-slate-500">No audit events for this request.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="font-semibold text-slate-900">Audit trail</h2>
      <ul className="mt-3 space-y-2">
        {events.map((e) => (
          <li key={e.id} className="flex gap-3 border-l-2 border-slate-200 pl-3 text-sm">
            <span className="shrink-0 text-slate-500">
              {new Date(e.createdAt).toLocaleString()}
            </span>
            <span className="text-slate-700">{e.summary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
