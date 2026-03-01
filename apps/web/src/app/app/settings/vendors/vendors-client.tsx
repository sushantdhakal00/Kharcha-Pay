"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";
import { useReauth } from "@/components/csrf-and-reauth-provider";

interface Vendor {
  id: string;
  name: string;
  legalName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  status: string;
  ownerPubkey: string | null;
  tokenAccount: string | null;
  createdAt: string;
  updatedAt: string;
}

function StatusPill({ status }: { status: string }) {
  const styles =
    status === "ACTIVE"
      ? "rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800"
      : status === "ARCHIVED"
        ? "rounded bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-700"
        : "rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800";
  const label = status === "ACTIVE" ? "Active" : status === "ARCHIVED" ? "Archived" : "Draft";
  return <span className={styles}>{label}</span>;
}

export function VendorsClient({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [editName, setEditName] = useState("");
  const [editLegalName, setEditLegalName] = useState("");
  const [editContactEmail, setEditContactEmail] = useState("");
  const [editContactPhone, setEditContactPhone] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editOwnerPubkey, setEditOwnerPubkey] = useState("");
  const [editStatus, setEditStatus] = useState<string>("DRAFT");
  const [savingEdit, setSavingEdit] = useState(false);
  const reauth = useReauth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/vendors`);
      const data = await res.json();
      if (res.ok) setVendors(data.vendors ?? []);
      else setError(data.error ?? "Failed to load");
    } catch {
      setError("Failed to load");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  function openEdit(v: Vendor) {
    setEditingVendor(v);
    setEditName(v.name);
    setEditLegalName(v.legalName ?? "");
    setEditContactEmail(v.contactEmail ?? "");
    setEditContactPhone(v.contactPhone ?? "");
    setEditNotes(v.notes ?? "");
    setEditOwnerPubkey(v.ownerPubkey ?? "");
    setEditStatus(v.status);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create");
        return;
      }
      setName("");
      load();
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingVendor) return;
    setError("");
    setSavingEdit(true);
    try {
      const trimmedName = editName.trim();
      if (!trimmedName) {
        setError("Name is required");
        setSavingEdit(false);
        return;
      }
      const body: Record<string, unknown> = {
        name: trimmedName,
        legalName: editLegalName.trim() || null,
        contactEmail: editContactEmail.trim() || null,
        contactPhone: editContactPhone.trim() || null,
        notes: editNotes.trim() || null,
        status: editStatus,
      };
      if (editOwnerPubkey.trim()) body.ownerPubkey = editOwnerPubkey.trim();
      else if (editingVendor.ownerPubkey) body.ownerPubkey = null;

      const res = await fetchWithCsrf(`/api/orgs/${orgId}/vendors/${editingVendor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "REAUTH_REQUIRED" && reauth) {
          reauth.showReauth(() => handleSaveEdit());
          return;
        }
        setError(data.error ?? data.details?.fieldErrors?.contactEmail?.[0] ?? data.details?.fieldErrors?.ownerPubkey?.[0] ?? "Failed to update");
        return;
      }
      setEditingVendor(null);
      load();
    } catch {
      setError("Something went wrong");
    } finally {
      setSavingEdit(false);
    }
  }

  if (loading) return <p className="mt-4 text-sm text-slate-600">Loading…</p>;

  return (
    <div className="mt-6 space-y-6">
      {isAdmin && (
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Vendor name"
            required
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Adding…" : "Add vendor"}
          </button>
        </form>
      )}
      <p className="text-sm text-slate-600">
        Only <strong>Active</strong> vendors can be selected on new requests and can be paid. Set wallet (pubkey) and then activate in the edit modal.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-2 text-left font-medium text-slate-700">Name</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700">Status</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700">Contact</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700">Wallet</th>
              {isAdmin && <th className="px-4 py-2 text-left font-medium text-slate-700">Action</th>}
            </tr>
          </thead>
          <tbody>
            {vendors.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 5 : 4} className="px-4 py-3 text-slate-500">
                  No vendors yet. {isAdmin ? "Add one to use in expense requests." : ""}
                </td>
              </tr>
            ) : (
              vendors.map((v) => (
                <tr key={v.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-2 font-medium text-slate-900">{v.name}</td>
                  <td className="px-4 py-2">
                    <StatusPill status={v.status} />
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {v.contactEmail || v.contactPhone || "—"}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-600 truncate max-w-[120px]">
                    {v.ownerPubkey ? `${v.ownerPubkey.slice(0, 8)}…` : "—"}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => openEdit(v)}
                        className="text-slate-700 hover:underline"
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editingVendor && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4" onClick={() => !savingEdit && setEditingVendor(null)}>
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">Edit vendor</h3>
            <p className="mt-1 text-xs text-slate-500">Set contact info, wallet pubkey, and status to Active so the vendor can be used and paid.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600">Display name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Legal name (optional)</label>
                <input
                  type="text"
                  value={editLegalName}
                  onChange={(e) => setEditLegalName(e.target.value)}
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Contact email</label>
                <input
                  type="email"
                  value={editContactEmail}
                  onChange={(e) => setEditContactEmail(e.target.value)}
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Contact phone</label>
                <input
                  type="text"
                  value={editContactPhone}
                  onChange={(e) => setEditContactPhone(e.target.value)}
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Vendor wallet (base58 pubkey)</label>
                <input
                  type="text"
                  value={editOwnerPubkey}
                  onChange={(e) => setEditOwnerPubkey(e.target.value)}
                  placeholder="Required for payment"
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
                <p className="mt-0.5 text-xs text-slate-500">Only Active vendors can be used on new requests and paid.</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              {editingVendor.status !== "ACTIVE" && (
                <button
                  type="button"
                  onClick={() => { setEditStatus("ACTIVE"); }}
                  className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                >
                  Activate vendor
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {savingEdit ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditingVendor(null)}
                disabled={savingEdit}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
