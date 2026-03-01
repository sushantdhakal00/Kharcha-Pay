"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";
import { getExplorerTxUrl } from "@/lib/solana/explorer-url";
import { useReauth } from "@/components/csrf-and-reauth-provider";
import { AuditEventsSection } from "./audit-events-section";

interface RequestData {
  id: string;
  orgId: string;
  title: string;
  purpose: string;
  category: string;
  amountMinor: string;
  currency: string;
  status: string;
  requiredApprovals: number;
  approvalsReceived: number;
  departmentName: string;
  vendorName: string;
  requesterUsername: string;
  submittedAt: string | null;
  decidedAt: string | null;
  paidAt: string | null;
  paidTxSig: string | null;
  paidToTokenAccount: string | null;
  cluster?: string | null;
  chainMint?: string | null;
  chainTokenProgramId?: string | null;
  verificationStatus: string;
  verificationCheckedAt: string | null;
  verificationReasons: string[];
  verificationDetails?: {
    reasons?: string[];
    observed?: { memo?: string; amountMinor?: string; source?: string; destination?: string; mint?: string; tokenProgram?: string };
    expected?: { memo: string; amountMinor: string; source: string; destination: string; mint: string; tokenProgram: string };
  } | null;
  createdAt: string;
  approvalActions: Array<{
    id: string;
    actorUsername: string;
    decision: string;
    note: string | null;
    createdAt: string;
  }>;
  receiptFiles: Array<{ id: string; downloadUrl: string; fileName: string }>;
}

interface PaymentReadiness {
  approved: boolean;
  receiptRequired: boolean;
  receiptAttached: boolean;
  withinBudget: boolean;
  budgetRemainingRequestMonth: string | null;
  vendorWalletSet: boolean;
  blockOverBudget: boolean;
  allowAdminOverride: boolean;
  exceedsBudget: boolean;
}

function isInternalMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_INTERNAL_MODE === "1" ||
    process.env.NEXT_PUBLIC_INTERNAL_MODE === "true"
  );
}

/** Demo mock-pay uses tx sig starting with 5demo5; Explorer would 404. */
function isDemoMockTxSig(sig: string | null | undefined): boolean {
  return !!(sig && sig.startsWith("5demo5"));
}

export function RequestDetailClient({
  request,
  budgetRemaining,
  paymentReadiness,
  canEdit,
  canSubmit,
  canDecide,
  canPay,
  canVerify,
  isDemo = false,
  orgSlug = "",
}: {
  request: RequestData;
  budgetRemaining: string | null;
  paymentReadiness: PaymentReadiness;
  canEdit: boolean;
  canSubmit: boolean;
  canDecide: boolean;
  canPay: boolean;
  canVerify?: boolean;
  isDemo?: boolean;
  orgSlug?: string;
}) {
  const router = useRouter();
  const reauth = useReauth() ?? undefined;
  const [deciding, setDeciding] = useState(false);
  const [decideNote, setDecideNote] = useState("");
  const [error, setError] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [overrideNote, setOverrideNote] = useState("");
  const [verifying, setVerifying] = useState(false);
  const searchParams = useSearchParams();
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [shortcutIds, setShortcutIds] = useState<{
    draftId: string | null;
    pendingId: string | null;
    approvedId: string | null;
    paidId: string | null;
  } | null>(null);

  const showDemoFlow = (isDemo || orgSlug === "demo-org") && isInternalMode();

  useEffect(() => {
    if (showDemoFlow && request.orgId) {
      fetch(`/api/demo/shortcut-ids?orgId=${request.orgId}`)
        .then((r) => r.json())
        .then((d) => {
          if (!d.error) setShortcutIds(d);
        })
        .catch(() => {});
    }
  }, [showDemoFlow, request.orgId]);

  useEffect(() => {
    if (
      request.status === "PAID" &&
      searchParams.get("proof") === "1" &&
      (request.paidTxSig || request.paidAt)
    ) {
      setProofModalOpen(true);
    }
  }, [request.status, request.paidTxSig, request.paidAt, searchParams]);

  async function handleSubmit() {
    setError("");
    try {
      const res = await fetchWithCsrf(`/api/orgs/${request.orgId}/requests/${request.id}/submit`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "REAUTH_REQUIRED" && reauth) {
          reauth.showReauth(handleSubmit);
          return;
        }
        setError(data.error ?? "Failed to submit");
        return;
      }
      if (showDemoFlow && shortcutIds?.pendingId) {
        router.push(`/app/requests/${shortcutIds.pendingId}`);
      } else {
        router.refresh();
      }
    } catch {
      setError("Failed to submit");
    }
  }

  async function handleDecide(decision: "APPROVE" | "REJECT") {
    setError("");
    setDeciding(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${request.orgId}/requests/${request.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: decideNote || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "REAUTH_REQUIRED" && reauth) {
          reauth.showReauth(() => handleDecide(decision));
          return;
        }
        setError(data.error ?? "Failed");
        return;
      }
      setDecideNote("");
      if (showDemoFlow && decision === "APPROVE" && shortcutIds?.approvedId) {
        router.push(`/app/requests/${shortcutIds.approvedId}`);
      } else {
        router.refresh();
      }
    } catch {
      setError("Failed");
    } finally {
      setDeciding(false);
    }
  }

  async function doPay(withOverride: boolean, redirectOnSuccess?: string) {
    const body: { overrideNote?: string } = {};
    if (withOverride && overrideNote.trim().length >= 5) body.overrideNote = overrideNote.trim();
    const res = await fetchWithCsrf(`/api/orgs/${request.orgId}/requests/${request.id}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.code === "REAUTH_REQUIRED" && reauth) {
        reauth.showReauth(() => doPay(withOverride, redirectOnSuccess));
        return;
      }
      const code = data.code as string | undefined;
      const msg = data.error ?? "Pay failed";
      const remaining = data.remainingMinor != null ? ` Remaining: ${Number(data.remainingMinor).toLocaleString()}.` : "";
      if (code === "RECEIPT_REQUIRED") setError("Receipt required before payment. Upload a receipt (draft only).");
      else if (code === "OVER_BUDGET") setError(`${msg}${remaining} ${data.remainingMinor != null ? "Use override if allowed." : ""}`);
      else if (code === "VENDOR_WALLET_NOT_SET") setError("Vendor wallet is not set. Set it in Vendors settings.");
      else if (code === "VENDOR_OWNER_NOT_SIGNABLE") setError("For this demo, set the vendor wallet to the treasury pubkey in Vendors settings (self-pay).");
      else setError(msg);
      return;
    }
    setOverrideNote("");
    if (redirectOnSuccess) {
      router.push(redirectOnSuccess);
    } else {
      router.refresh();
    }
  }

  async function handlePay(withOverride = false) {
    setError("");
    setPaying(true);
    try {
      const redirect = showDemoFlow && shortcutIds?.paidId ? `/app/requests/${shortcutIds.paidId}?proof=1` : undefined;
      await doPay(withOverride, redirect);
    } catch {
      setError("Pay failed");
    } finally {
      setPaying(false);
    }
  }

  async function handleReceiptUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!receiptFile) return;
    setError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", receiptFile);
      const res = await fetchWithCsrf(`/api/orgs/${request.orgId}/requests/${request.id}/receipt`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }
      setReceiptFile(null);
      router.refresh();
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const remainingNum = budgetRemaining ? Number(budgetRemaining) : null;
  const amountNum = Number(request.amountMinor);
  const exceedsBudgetCurrentMonth = remainingNum !== null && amountNum > remainingNum;
  const { approved, receiptRequired, receiptAttached, withinBudget, budgetRemainingRequestMonth, vendorWalletSet, allowAdminOverride, exceedsBudget } = paymentReadiness;
  const canPayWithOverride = canPay && exceedsBudget && allowAdminOverride && overrideNote.trim().length >= 5;
  const payNowDisabled = paying || !approved || (receiptRequired && !receiptAttached) || !vendorWalletSet || (exceedsBudget && allowAdminOverride);
  const payOverrideDisabled = paying || !canPayWithOverride || (receiptRequired && !receiptAttached) || !vendorWalletSet;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        {showDemoFlow && (
          <div className="mb-4 rounded-lg border-2 border-indigo-200 bg-indigo-50/80 p-4 dark:border-indigo-800 dark:bg-indigo-950/40">
            <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">Next demo action</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {request.status === "DRAFT" && canSubmit && (
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Submit (Demo)
                </button>
              )}
              {request.status === "PENDING" && canDecide && (
                <>
                  <button
                    type="button"
                    onClick={() => handleDecide("APPROVE")}
                    disabled={deciding}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {deciding ? "Approving…" : "Approve (Demo)"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDecide("REJECT")}
                    disabled={deciding}
                    className="rounded-lg border border-indigo-600 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-500 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
                  >
                    Reject
                  </button>
                </>
              )}
              {request.status === "APPROVED" && canPay && (
                <button
                  type="button"
                  onClick={() => handlePay(false)}
                  disabled={paying || payNowDisabled}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {paying ? "Paying…" : "Pay (Demo)"}
                </button>
              )}
              {request.status === "PAID" && (request.paidTxSig || request.paidAt) && (
                <button
                  type="button"
                  onClick={() => setProofModalOpen(true)}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Open Proof
                </button>
              )}
            </div>
          </div>
        )}
        <div className="flex items-start justify-between">
          <h1 className="text-xl font-semibold text-slate-900">{request.title}</h1>
          <span
            className={
              request.status === "PAID"
                ? "rounded bg-emerald-100 px-2 py-1 text-sm font-medium text-emerald-800"
                : request.status === "APPROVED"
                  ? "rounded bg-green-100 px-2 py-1 text-sm font-medium text-green-800"
                  : request.status === "REJECTED"
                    ? "rounded bg-red-100 px-2 py-1 text-sm font-medium text-red-800"
                    : request.status === "PENDING"
                      ? "rounded bg-amber-100 px-2 py-1 text-sm font-medium text-amber-800"
                      : "rounded bg-slate-100 px-2 py-1 text-sm font-medium text-slate-700"
            }
          >
            {request.status}
          </span>
        </div>
        <dl className="mt-4 grid gap-2 text-sm">
          <div><dt className="text-slate-500">Department</dt><dd>{request.departmentName}</dd></div>
          <div><dt className="text-slate-500">Vendor</dt><dd>{request.vendorName}</dd></div>
          <div><dt className="text-slate-500">Requester</dt><dd>{request.requesterUsername}</dd></div>
          <div><dt className="text-slate-500">Category</dt><dd>{request.category}</dd></div>
          <div><dt className="text-slate-500">Amount</dt><dd>{Number(request.amountMinor).toLocaleString()} ({request.currency} minor)</dd></div>
          <div><dt className="text-slate-500">Purpose</dt><dd className="mt-1 whitespace-pre-wrap">{request.purpose}</dd></div>
          {request.status === "PENDING" && (
            <div>
              <dt className="text-slate-500">Approvals</dt>
              <dd>
                {request.approvalsReceived} / {request.requiredApprovals} required
              </dd>
            </div>
          )}
        </dl>
        {canPay && (
          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-medium text-slate-700">Payment readiness</p>
            <ul className="mt-2 space-y-1">
              <li className={approved ? "text-green-700" : "text-slate-600"}>Approved: {approved ? "Yes" : "No"}</li>
              {receiptRequired && (
                <li className={receiptAttached ? "text-green-700" : "text-amber-700"}>Receipt attached: {receiptAttached ? "Yes" : "No (required)"}</li>
              )}
              {paymentReadiness.blockOverBudget && budgetRemainingRequestMonth != null && (
                <li className={withinBudget ? "text-green-700" : "text-amber-700"}>
                  Within budget: {withinBudget ? "Yes" : "No"} (remaining: {Number(budgetRemainingRequestMonth).toLocaleString()})
                </li>
              )}
              <li className={vendorWalletSet ? "text-green-700" : "text-amber-700"}>Vendor wallet set: {vendorWalletSet ? "Yes" : "No"}</li>
            </ul>
          </div>
        )}
        {budgetRemaining !== null && (
          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
            <p>Remaining budget (current month): <strong>{Number(budgetRemaining).toLocaleString()}</strong></p>
            {exceedsBudgetCurrentMonth && <p className="mt-1 text-amber-700">This request exceeds remaining budget this month.</p>}
          </div>
        )}
        {request.receiptFiles.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-slate-700">Receipts</p>
            <ul className="mt-1 space-y-1">
              {request.receiptFiles.map((r) => (
                <li key={r.id}>
                  <a href={r.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-slate-900 hover:underline">{r.fileName}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {canEdit && (
          <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
            <form onSubmit={handleReceiptUpload} className="flex items-end gap-2">
              <input
                type="file"
                accept=".pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
              <button type="submit" disabled={!receiptFile || uploading} className="rounded bg-slate-200 px-3 py-1 text-sm disabled:opacity-50">
                {uploading ? "Uploading…" : "Upload receipt"}
              </button>
            </form>
            <div className="flex gap-2">
              <Link href={`/app/requests/${request.id}/edit`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Edit draft
              </Link>
              {canSubmit && (
                <button type="button" onClick={handleSubmit} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                  Submit for approval
                </button>
              )}
            </div>
          </div>
        )}
        {canDecide && (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-700">Approve or reject</p>
            <textarea
              value={decideNote}
              onChange={(e) => setDecideNote(e.target.value)}
              placeholder="Optional note"
              rows={2}
              className="mt-2 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => handleDecide("APPROVE")}
                disabled={deciding}
                className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => handleDecide("REJECT")}
                disabled={deciding}
                className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        )}
        {canPay && (
          <div className="mt-4 border-t border-slate-200 pt-4">
            {exceedsBudget && allowAdminOverride && (
              <div className="mb-3">
                <p className="text-sm font-medium text-amber-800">Over budget — admin override allowed</p>
                <textarea
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  placeholder="Override note (min 5 characters)"
                  rows={2}
                  className="mt-1 w-full rounded border border-amber-300 px-3 py-2 text-sm"
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handlePay(false)}
                disabled={payNowDisabled}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {paying ? "Paying…" : "Pay now"}
              </button>
              {exceedsBudget && allowAdminOverride && (
                <button
                  type="button"
                  onClick={() => handlePay(true)}
                  disabled={payOverrideDisabled}
                  className="rounded-lg border border-amber-600 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                >
                  Pay with override
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">Token-2022 transfer with Request-ID memo (devnet).</p>
          </div>
        )}
        {(request.status === "PAID" && (request.paidTxSig || request.paidAt)) && (
          <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <p className="font-medium text-emerald-800 dark:text-emerald-200">Paid</p>
                <span
                  className={
                    request.verificationStatus === "VERIFIED"
                      ? "rounded bg-emerald-200 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-700 dark:text-emerald-100"
                      : request.verificationStatus === "WARNING"
                        ? "rounded bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-800 dark:text-amber-100"
                        : request.verificationStatus === "FAILED"
                          ? "rounded bg-red-200 px-2 py-0.5 text-xs font-medium text-red-900 dark:bg-red-800 dark:text-red-100"
                          : "rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-600 dark:text-slate-200"
                  }
                >
                  {request.verificationStatus === "VERIFIED"
                    ? "Verified on Solana"
                    : request.verificationStatus === "PENDING"
                      ? "Pending"
                      : request.verificationStatus === "WARNING"
                        ? "Warning"
                        : request.verificationStatus === "FAILED"
                          ? "Failed"
                          : request.verificationStatus}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setProofModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
                >
                  Verification details
                </button>
                {request.paidTxSig && (
                  isDemoMockTxSig(request.paidTxSig) ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      title="Explorer link disabled in demo mock-pay (no on-chain tx)"
                    >
                      Explorer (mock-pay demo)
                    </span>
                  ) : (
                    <a
                      href={getExplorerTxUrl(request.paidTxSig, request.cluster)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                    >
                      View on Explorer
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )
                )}
              </div>
            </div>
            {request.verificationReasons.length > 0 && (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                {request.verificationReasons.join("; ")}
              </p>
            )}
            {request.paidAt && <p className="mt-1 text-slate-700 dark:text-slate-300">Paid at: {new Date(request.paidAt).toLocaleString()}</p>}
            {request.paidTxSig && (
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 font-mono">
                paidTxSig: {request.paidTxSig.slice(0, 12)}…{request.paidTxSig.slice(-8)}
              </p>
            )}
            {request.paidTxSig && !isDemoMockTxSig(request.paidTxSig) && (
              <p className="mt-0.5 text-xs">
                <a
                  href={getExplorerTxUrl(request.paidTxSig, request.cluster)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 underline hover:no-underline dark:text-emerald-400"
                >
                  View on Explorer ({request.cluster === "mainnet-beta" ? "mainnet" : "devnet"})
                </a>
              </p>
            )}
            {(request.chainTokenProgramId || request.chainMint) && (
              <div className="mt-2 space-y-0.5 text-xs text-slate-600 dark:text-slate-400">
                {request.chainTokenProgramId && (
                  <p className="font-mono">Token-2022 Program: {request.chainTokenProgramId}</p>
                )}
                {request.chainMint && (
                  <p className="font-mono break-all">Mint: {request.chainMint}</p>
                )}
              </div>
            )}
            {request.paidToTokenAccount && (
              <p className="mt-1 text-slate-600 break-all text-xs">To: {request.paidToTokenAccount}</p>
            )}
            {canVerify && (
              <div className="mt-3">
                <button
                  type="button"
                  disabled={verifying}
                  onClick={async () => {
                    const doVerify = async () => {
                      setVerifying(true);
                      try {
                        const res = await fetchWithCsrf(
                          `/api/orgs/${request.orgId}/reconcile/request`,
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ requestId: request.id }),
                          }
                        );
                        const data = await res.json();
                        if (!res.ok && data.code === "REAUTH_REQUIRED" && reauth) {
                          reauth?.showReauth(doVerify);
                          return;
                        }
                        if (res.ok) router.refresh();
                      } finally {
                        setVerifying(false);
                      }
                    };
                    doVerify();
                  }}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {verifying ? "Verifying…" : "Verify now"}
                </button>
              </div>
            )}
          </div>
        )}
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>

      {request.approvalActions.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-900">Timeline</h2>
          <ul className="mt-3 space-y-3">
            {request.approvalActions.map((a) => (
              <li key={a.id} className="flex gap-3 border-l-2 border-slate-200 pl-3">
                <div className="text-sm">
                  <span className="font-medium">{a.actorUsername}</span>{" "}
                  <span className={a.decision === "APPROVE" ? "text-green-700" : "text-red-700"}>{a.decision}</span>
                  {" "}<span className="text-slate-500">{new Date(a.createdAt).toLocaleString()}</span>
                  {a.note && <p className="mt-1 text-slate-600">{a.note}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AuditEventsSection orgId={request.orgId} requestId={request.id} />

      {proofModalOpen && (
        <ProofModal
          request={request}
          onClose={() => setProofModalOpen(false)}
        />
      )}
    </div>
  );
}

const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

function ProofModal({ request, onClose }: { request: RequestData; onClose: () => void }) {
  const details = request.verificationDetails;
  const observed = details?.observed;
  const expected = details?.expected;
  const cluster = request.cluster === "mainnet-beta" ? "mainnet-beta" : "devnet";

  const copySig = () => {
    if (request.paidTxSig) {
      void navigator.clipboard.writeText(request.paidTxSig);
    }
  };

  const reasons = request.verificationReasons ?? [];
  const txNotFound = reasons.some((r) => r.toLowerCase().includes("transaction not found") || r.toLowerCase().includes("not found"));
  const hasVerificationData = !!observed || !!expected;

  const checklistItems: { label: string; status: "pass" | "fail" | "na" }[] = [
    {
      label: "Transaction confirmed",
      status: !hasVerificationData ? "na" : txNotFound ? "fail" : "pass",
    },
    {
      label: "Memo matches KharchaPay Request {requestId} [...]",
      status: observed?.memo && expected?.memo ? (observed.memo === expected.memo ? "pass" : "fail") : "na",
    },
    {
      label: "Token program is Token-2022",
      status: (() => {
        const p = observed?.tokenProgram ?? expected?.tokenProgram;
        if (!p) return "na";
        return p.includes(TOKEN_2022_PROGRAM_ID) ? "pass" : "fail";
      })(),
    },
    {
      label: "Mint matches org configured mint",
      status: observed?.mint && expected?.mint ? (observed.mint === expected.mint ? "pass" : "fail") : "na",
    },
    {
      label: "Source is org treasury token account",
      status: observed?.source && expected?.source ? (observed.source === expected.source ? "pass" : "fail") : "na",
    },
    {
      label: "Destination is vendor token account",
      status: observed?.destination && expected?.destination ? (observed.destination === expected.destination ? "pass" : "fail") : "na",
    },
    {
      label: "Amount matches request amountMinor",
      status: observed?.amountMinor && expected?.amountMinor ? (observed.amountMinor === expected.amountMinor ? "pass" : "fail") : "na",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 dark:bg-black/60"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-lg dark:bg-zinc-800 dark:border dark:border-zinc-700"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-stone-100">Proof of Payment (Solana)</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-stone-400">Independent verification of this expense payment.</p>

        <div className="mt-4 space-y-4">
          <section>
            <h4 className="text-sm font-medium text-slate-700 dark:text-stone-300">Transaction</h4>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-500 dark:text-stone-400">Signature</dt>
                <dd className="flex items-center gap-2 font-mono text-xs">
                  {request.paidTxSig ? (
                    <>
                      <span className="truncate">{request.paidTxSig.slice(0, 16)}…</span>
                      <button
                        type="button"
                        onClick={copySig}
                        className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-zinc-600 dark:hover:bg-zinc-700"
                      >
                        Copy
                      </button>
                    </>
                  ) : (
                    <span className="text-slate-400">Not available</span>
                  )}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-500 dark:text-stone-400">Network</dt>
                <dd>{cluster}</dd>
              </div>
              {request.chainTokenProgramId && (
                <div>
                  <dt className="text-slate-500 dark:text-stone-400">Token-2022 Program ID</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs">{request.chainTokenProgramId}</dd>
                </div>
              )}
              {request.chainMint && (
                <div>
                  <dt className="text-slate-500 dark:text-stone-400">Mint address</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs">{request.chainMint}</dd>
                </div>
              )}
              {request.paidTxSig && (
                <div>
                  {isDemoMockTxSig(request.paidTxSig) ? (
                    <span className="text-slate-500 dark:text-slate-400" title="Explorer link disabled in demo mock-pay">
                      Explorer (mock-pay demo — no on-chain tx)
                    </span>
                  ) : (
                    <a
                      href={getExplorerTxUrl(request.paidTxSig, request.cluster)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-700 underline hover:no-underline dark:text-emerald-400"
                    >
                      View on Explorer ({request.cluster === "mainnet-beta" ? "mainnet" : "devnet"})
                    </a>
                  )}
                </div>
              )}
            </dl>
          </section>

          <section>
            <h4 className="text-sm font-medium text-slate-700 dark:text-stone-300">What we verify</h4>
            <ul className="mt-2 space-y-1.5 text-sm">
              {checklistItems.map((item, i) => (
                <li key={i} className="flex items-center gap-2">
                  {item.status === "pass" && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">✓</span>
                  )}
                  {item.status === "fail" && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">✗</span>
                  )}
                  {item.status === "na" && (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-zinc-700 dark:text-zinc-400">—</span>
                  )}
                  <span className={item.status === "fail" ? "text-red-700 dark:text-red-300" : ""}>{item.label}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h4 className="text-sm font-medium text-slate-700 dark:text-stone-300">Data</h4>
            <dl className="mt-2 space-y-1.5 text-xs">
              <div><dt className="text-slate-500 dark:text-stone-400">Memo</dt><dd className="mt-0.5 break-all font-mono">{observed?.memo ?? expected?.memo ?? "Not available"}</dd></div>
              <div><dt className="text-slate-500 dark:text-stone-400">Token mint</dt><dd className="mt-0.5 break-all font-mono">{observed?.mint ?? expected?.mint ?? "Not available"}</dd></div>
              <div><dt className="text-slate-500 dark:text-stone-400">From (source)</dt><dd className="mt-0.5 break-all font-mono">{observed?.source ?? expected?.source ?? "Not available"}</dd></div>
              <div><dt className="text-slate-500 dark:text-stone-400">To (destination)</dt><dd className="mt-0.5 break-all font-mono">{observed?.destination ?? expected?.destination ?? "Not available"}</dd></div>
              <div><dt className="text-slate-500 dark:text-stone-400">Amount</dt><dd className="mt-0.5">{observed?.amountMinor ?? expected?.amountMinor ?? request.amountMinor ? `${Number(request.amountMinor).toLocaleString()} (minor)` : "Not available"}</dd></div>
              <div>
                <dt className="text-slate-500 dark:text-stone-400">Reconciliation status</dt>
                <dd className="mt-0.5">{request.verificationStatus}</dd>
              </div>
              {request.verificationCheckedAt && (
                <div>
                  <dt className="text-slate-500 dark:text-stone-400">Last checked</dt>
                  <dd className="mt-0.5">{new Date(request.verificationCheckedAt).toLocaleString()}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-600 dark:text-stone-300 dark:hover:bg-zinc-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
