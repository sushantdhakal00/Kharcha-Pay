"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

type Endpoint = {
  id: string;
  url: string;
  status: string;
  subscribedEventTypes: string[];
  lastDeliveryAt: string | null;
  createdAt: string;
  attemptCount: number;
};

type Observability = {
  pendingCount: number;
  oldestPendingAt: string | null;
  deadLettersLast24h: number;
  successRateLast24h: number;
};

const EVENT_OPTIONS = [
  "VENDOR_CREATED",
  "VENDOR_ACTIVATED",
  "VENDOR_BLOCKED",
  "VENDOR_BANK_CHANGE_APPROVED",
  "INVOICE_SUBMITTED",
  "INVOICE_VERIFIED",
  "INVOICE_REJECTED",
  "MATCH_EXCEPTION_CREATED",
  "MATCH_EXCEPTION_RESOLVED",
  "PAYMENT_CREATED",
  "PAYMENT_PAID",
];

export function IntegrationsClient({ orgId }: { orgId: string }) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [obs, setObs] = useState<Observability | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(null);

  const load = useCallback(async () => {
    const [epRes, obsRes] = await Promise.all([
      fetch(`/api/orgs/${orgId}/webhooks`),
      fetch(`/api/orgs/${orgId}/webhooks/observability`),
    ]);
    const epData = await epRes.json();
    const obsData = await obsRes.json();
    if (!epData.error) setEndpoints(epData.endpoints ?? []);
    if (!obsData.error) setObs(obsData);
  }, [orgId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) return <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Loading…</p>;

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Accounting</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          QuickBooks Online – sync Chart of Accounts, export bills and payments.
        </p>
        <a
          href={`/app/settings/integrations/quickbooks`}
          className="mt-2 inline-block text-sm text-slate-700 underline hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
        >
          Configure QuickBooks →
        </a>
      </div>
      {obs && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Observability</h2>
          <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Outbox pending</p>
              <p className="font-medium">{obs.pendingCount}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Oldest pending</p>
              <p className="text-sm">{obs.oldestPendingAt ? new Date(obs.oldestPendingAt).toLocaleString() : "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Dead letters (24h)</p>
              <p className="font-medium">{obs.deadLettersLast24h}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Success rate (24h)</p>
              <p className="font-medium">{obs.successRateLast24h}%</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Webhook endpoints</h2>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Add endpoint
        </button>
      </div>

      <div className="space-y-2">
        {endpoints.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No webhook endpoints yet.</p>
        ) : (
          endpoints.map((ep) => (
            <div
              key={ep.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
            >
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">{ep.url}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {ep.status} · {ep.attemptCount} attempts · last: {ep.lastDeliveryAt ? new Date(ep.lastDeliveryAt).toLocaleString() : "never"}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedEndpoint(ep)}
                  className="text-sm text-slate-600 hover:underline dark:text-slate-400"
                >
                  Delivery log
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const status = ep.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
                    await fetchWithCsrf(`/api/orgs/${orgId}/webhooks/${ep.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status }),
                    });
                    load();
                  }}
                  className="text-sm text-slate-600 hover:underline dark:text-slate-400"
                >
                  {ep.status === "ACTIVE" ? "Disable" : "Enable"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showCreate && (
        <CreateEndpointModal
          orgId={orgId}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {selectedEndpoint && (
        <DeliveryLogModal
          orgId={orgId}
          endpoint={selectedEndpoint}
          onClose={() => setSelectedEndpoint(null)}
        />
      )}
    </div>
  );
}

function CreateEndpointModal({
  orgId,
  onClose,
  onCreated,
}: {
  orgId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [events, setEvents] = useState<string[]>(["*"]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, secret, subscribedEventTypes: events }),
      });
      const data = await res.json();
      if (res.ok) onCreated();
      else setError(data.error ?? "Failed");
    } catch {
      setError("Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Add webhook endpoint</h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">URL (HTTPS)</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Secret (min 16 chars)</label>
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              minLength={16}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Event types</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {EVENT_OPTIONS.map((ev) => (
                <label key={ev} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={events.includes("*") || events.includes(ev)}
                    onChange={(e) => {
                      if (ev === "*") setEvents(e.target.checked ? ["*"] : []);
                      else setEvents((prev) => (e.target.checked ? [...prev.filter((x) => x !== "*"), ev] : prev.filter((x) => x !== ev)));
                    }}
                  />
                  {ev}
                </label>
              ))}
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={events.includes("*")} onChange={(e) => setEvents(e.target.checked ? ["*"] : [])} />
                *
              </label>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded px-4 py-2 text-slate-600 hover:bg-slate-100 dark:text-slate-400">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900">
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeliveryLogModal({ orgId, endpoint, onClose }: { orgId: string; endpoint: Endpoint; onClose: () => void }) {
  const [attempts, setAttempts] = useState<Array<{ id: string; outboxEventId: string; eventType: string; attemptNumber: number; status: string; responseStatus?: number; errorMessage?: string; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/orgs/${orgId}/webhooks/${endpoint.id}/attempts?limit=30`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setAttempts(d.attempts ?? []);
      })
      .finally(() => setLoading(false));
  }, [orgId, endpoint.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Delivery log: {endpoint.url}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">×</button>
        </div>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : attempts.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No deliveries yet.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {attempts.map((a) => (
              <div key={a.id} className="rounded border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{a.eventType}</span>
                  <span className={a.status === "SUCCESS" ? "text-green-600" : a.status === "DEAD" ? "text-red-600" : "text-amber-600"}>{a.status}</span>
                </div>
                <p className="text-xs text-slate-500">Attempt #{a.attemptNumber} · {new Date(a.createdAt).toLocaleString()} {a.responseStatus != null && `· HTTP ${a.responseStatus}`}</p>
                {a.errorMessage && <p className="text-xs text-red-500">{a.errorMessage}</p>}
                <button
                  type="button"
                  className="mt-1 text-xs text-slate-600 hover:underline"
                  onClick={async () => {
                    await fetchWithCsrf(`/api/orgs/${orgId}/webhooks/replay`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ outboxEventId: a.outboxEventId, endpointId: endpoint.id }),
                    });
                  }}
                >
                  Replay
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
