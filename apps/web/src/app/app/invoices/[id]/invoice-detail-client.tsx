"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

interface Invoice {
  id: string;
  invoiceNumber: string;
  vendorName: string;
  type: string;
  poId: string | null;
  poNumber: string | null;
  totalMinor: string;
  status: string;
  submittedAt: string | null;
  dueAt: string | null;
  departmentId: string | null;
  departmentName: string | null;
  glCode: string | null;
  costCenterId: string | null;
  projectId: string | null;
  lineItems: Array<{ id: string; description: string; qty: number; unitPriceMinor: string; totalMinor: string }>;
  attachments: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string }>;
  matchResult: {
    matchType: string;
    status: string;
    diffsJson: unknown[];
    computedAt: string;
  } | null;
  qboLink?: { realmId: string; remoteId: string; viewUrl: string } | null;
}

export function InvoiceDetailClient({
  orgId,
  invoiceId,
  canVerify,
  isAdmin,
}: {
  orgId: string;
  invoiceId: string;
  canVerify: boolean;
  isAdmin?: boolean;
}) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actioning, setActioning] = useState(false);

  function load() {
    fetch(`/api/orgs/${orgId}/invoices/${invoiceId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setInvoice(data.invoice);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, invoiceId]);

  async function submit() {
    setActioning(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/invoices/${invoiceId}/submit`, { method: "POST" });
      if (res.ok) load();
    } finally {
      setActioning(false);
    }
  }

  async function verify() {
    setActioning(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/invoices/${invoiceId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) load();
    } finally {
      setActioning(false);
    }
  }

  async function reject() {
    if (!confirm("Reject this invoice?")) return;
    setActioning(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/invoices/${invoiceId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Rejected by user" }),
      });
      if (res.ok) load();
    } finally {
      setActioning(false);
    }
  }

  async function recomputeMatch() {
    setActioning(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/invoices/${invoiceId}/match/recompute`, {
        method: "POST",
      });
      if (res.ok) load();
    } finally {
      setActioning(false);
    }
  }

  if (loading) return <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Loading…</p>;
  if (error || !invoice) return <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error || "Invoice not found"}</p>;

  const diffs = (invoice.matchResult?.diffsJson as Array<{ lineIndex?: number; reason?: string; qtyDiff?: number; priceDiffPct?: number }>) ?? [];

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{invoice.invoiceNumber}</h1>
        <span
          className={`rounded px-2 py-1 text-sm font-medium ${
            invoice.status === "EXCEPTION"
              ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
              : invoice.status === "VERIFIED" || invoice.status === "APPROVED"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                : "bg-slate-200 text-slate-700 dark:bg-slate-600 dark:text-slate-200"
          }`}
        >
          {invoice.status}
        </span>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Vendor: {invoice.vendorName} | Type: {invoice.type}
        {invoice.poNumber && ` | PO: ${invoice.poNumber}`}
      </p>
      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
        Total: {Number(invoice.totalMinor).toLocaleString()}
        {invoice.dueAt && ` | Due: ${new Date(invoice.dueAt).toLocaleDateString()}`}
      </p>
      {invoice.qboLink && (
        <p className="text-sm">
          <a
            href={invoice.qboLink.viewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            View in QuickBooks
          </a>
        </p>
      )}
      <InvoiceCodingSection
        orgId={orgId}
        invoiceId={invoiceId}
        departmentId={invoice.departmentId}
        departmentName={invoice.departmentName}
        glCode={invoice.glCode}
        status={invoice.status}
        type={invoice.type}
        canVerify={canVerify}
        isAdmin={!!isAdmin}
        onRefresh={load}
      />
      {invoice.status !== "DRAFT" &&
        invoice.status !== "REJECTED" &&
        (!invoice.departmentId || !invoice.glCode) && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
            Uncoded
          </span>
        )}

      <div className="flex flex-wrap gap-2">
        {invoice.status === "DRAFT" && (
          <button
            onClick={submit}
            disabled={actioning}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            Submit invoice
          </button>
        )}
        {canVerify && (invoice.status === "NEEDS_VERIFICATION" || invoice.status === "EXCEPTION") && (
          <>
            <button
              onClick={verify}
              disabled={actioning}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Verify
            </button>
            <button
              onClick={reject}
              disabled={actioning}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-slate-600 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              Reject
            </button>
          </>
        )}
        {canVerify && invoice.matchResult && (
          <button
            onClick={recomputeMatch}
            disabled={actioning}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Recompute match
          </button>
        )}
      </div>

      {invoice.matchResult && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Match summary</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {invoice.matchResult.matchType} match: {invoice.matchResult.status}
          </p>
          {diffs.length > 0 && invoice.matchResult.status !== "MATCHED" && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left font-medium">Line</th>
                    <th className="text-left font-medium">Reason</th>
                    <th className="text-right font-medium">Qty diff</th>
                    <th className="text-right font-medium">Price diff %</th>
                  </tr>
                </thead>
                <tbody>
                  {diffs.map((d, i) => (
                    <tr key={i}>
                      <td>{d.lineIndex != null ? d.lineIndex + 1 : "—"}</td>
                      <td>{d.reason ?? "—"}</td>
                      <td className="text-right">{d.qtyDiff ?? "—"}</td>
                      <td className="text-right">{d.priceDiffPct != null ? d.priceDiffPct.toFixed(1) + "%" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <h2 className="border-b border-slate-200 px-4 py-2 text-sm font-semibold dark:border-slate-700 dark:text-slate-100">
          Line items
        </h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Description</th>
              <th className="px-4 py-2 text-right font-medium text-slate-700 dark:text-slate-300">Qty</th>
              <th className="px-4 py-2 text-right font-medium text-slate-700 dark:text-slate-300">Unit price</th>
              <th className="px-4 py-2 text-right font-medium text-slate-700 dark:text-slate-300">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2">{l.description}</td>
                <td className="px-4 py-2 text-right">{l.qty}</td>
                <td className="px-4 py-2 text-right">{Number(l.unitPriceMinor).toLocaleString()}</td>
                <td className="px-4 py-2 text-right">{Number(l.totalMinor).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <InvoiceAttachmentsPanel
        orgId={orgId}
        invoiceId={invoiceId}
        attachments={invoice.attachments ?? []}
        status={invoice.status}
        isAdmin={!!isAdmin}
        onRefresh={load}
      />
    </div>
  );
}

function InvoiceCodingSection({
  orgId,
  invoiceId,
  departmentId,
  departmentName,
  glCode,
  status,
  type,
  canVerify,
  isAdmin,
  onRefresh,
}: {
  orgId: string;
  invoiceId: string;
  departmentId: string | null;
  departmentName: string | null;
  glCode: string | null;
  status: string;
  type: string;
  canVerify: boolean;
  isAdmin: boolean;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deptId, setDeptId] = useState(departmentId ?? "");
  const [gl, setGl] = useState(glCode ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [glCodes, setGlCodes] = useState<{ id: string; code: string; name: string }[]>([]);

  const canEdit =
    status === "DRAFT" ||
    ((status === "NEEDS_VERIFICATION" || status === "EXCEPTION") && canVerify) ||
    isAdmin;

  useEffect(() => {
    if (editing) {
      fetch(`/api/orgs/${orgId}/departments`)
        .then((r) => r.json())
        .then((d) => setDepartments(d.departments ?? []));
      fetch(`/api/orgs/${orgId}/gl-codes`)
        .then((r) => r.json())
        .then((g) => setGlCodes(g.glCodes ?? []));
    }
  }, [orgId, editing]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/invoices/${invoiceId}/coding`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId: deptId || null,
          glCode: gl || null,
          reason: canVerify && status !== "DRAFT" ? reason : undefined,
        }),
      });
      if (res.ok) {
        setEditing(false);
        onRefresh();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Coding</span>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-slate-600 hover:underline dark:text-slate-400"
          >
            Edit
          </button>
        )}
      </div>
      {!editing ? (
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {departmentName ?? "—"} {glCode ? `| GL: ${glCode}` : "| No GL code"}
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          <select
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">Select department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select
            value={gl}
            onChange={(e) => setGl(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">Select GL code</option>
            {glCodes.map((g) => (
              <option key={g.id} value={g.code}>{g.code} – {g.name}</option>
            ))}
          </select>
          {canVerify && status !== "DRAFT" && (
            <input
              type="text"
              placeholder="Override reason (required)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || !deptId || !gl}
              className="rounded bg-slate-900 px-2 py-1 text-xs text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];
const MAX_MB = 10;

function InvoiceAttachmentsPanel({
  orgId,
  invoiceId,
  attachments,
  status,
  isAdmin,
  onRefresh,
}: {
  orgId: string;
  invoiceId: string;
  attachments: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number }>;
  status: string;
  isAdmin: boolean;
  onRefresh: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const canUpload = status === "DRAFT" || status === "SUBMITTED" || status === "NEEDS_VERIFICATION" || status === "EXCEPTION";
  const canRemove = status === "DRAFT" || isAdmin;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    if (file.size > MAX_MB * 1024 * 1024) {
      setUploadError(`File too large (max ${MAX_MB}MB)`);
      return;
    }
    const mime = file.type || "application/octet-stream";
    if (!ALLOWED_MIME.includes(mime)) {
      setUploadError("Allowed: PDF, JPEG, PNG");
      return;
    }
    setUploading(true);
    try {
      const presignRes = await fetchWithCsrf(
        `/api/orgs/${orgId}/invoices/${invoiceId}/attachments/presign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            mimeType: mime,
            sizeBytes: file.size,
          }),
        }
      );
      const presignData = await presignRes.json();
      if (!presignRes.ok) {
        setUploadError(presignData.error ?? "Failed to get upload URL");
        return;
      }
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetchWithCsrf(presignData.uploadUrl, {
        method: "POST",
        headers: {
          "X-Upload-Token": presignData.requiredHeaders["X-Upload-Token"],
        },
        body: formData,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json();
        setUploadError(err.error ?? "Upload failed");
        return;
      }
      onRefresh();
      (e.target as HTMLInputElement).value = "";
    } catch {
      setUploadError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function getDownloadUrl(attachmentId: string): Promise<string | null> {
    const res = await fetch(
      `/api/orgs/${orgId}/invoices/${invoiceId}/attachments/${attachmentId}/download-url`
    );
    const data = await res.json();
    return data.downloadUrl ?? null;
  }

  async function remove(attachmentId: string) {
    if (!confirm("Remove this attachment?")) return;
    const res = await fetchWithCsrf(
      `/api/orgs/${orgId}/invoices/${invoiceId}/attachments/${attachmentId}`,
      { method: "DELETE" }
    );
    if (res.ok) onRefresh();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <h2 className="border-b border-slate-200 px-4 py-2 text-sm font-semibold dark:border-slate-700 dark:text-slate-100">
        Attachments
      </h2>
      <div className="p-4">
        {attachments.length === 0 && !canUpload && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No attachments.
          </p>
        )}
        {attachments.length === 0 && canUpload && (
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Add invoice PDF or photo for verification.
          </p>
        )}
        {canUpload && (
          <div className="mb-3">
            <label className="cursor-pointer rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                disabled={uploading}
                onChange={handleUpload}
              />
              {uploading ? "Uploading…" : "Upload PDF or image"}
            </label>
            {uploadError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{uploadError}</p>
            )}
          </div>
        )}
        <ul className="space-y-1">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded bg-slate-50 py-2 px-3 dark:bg-slate-800"
            >
              <a
                href="#"
                onClick={async (e) => {
                  e.preventDefault();
                  const url = await getDownloadUrl(a.id);
                  if (url) window.open(url, "_blank");
                }}
                className="text-sm font-medium text-slate-900 hover:underline dark:text-slate-100"
              >
                {a.fileName} ({(a.sizeBytes / 1024).toFixed(1)} KB)
              </a>
              {canRemove && (
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  className="text-xs text-red-600 hover:underline dark:text-red-400"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
