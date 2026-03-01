"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";
import { PayWithWallet } from "@/components/pay-with-wallet";

type IntentData = {
  id: string;
  organizationId: string;
  status: string;
  requiredSol: string;
  requiredLamports: string;
  paidLamports: string;
  treasuryPubkey: string;
  depositPubkey: string;
  useUniqueAddress?: boolean;
  reference: string;
  expiresAt: string;
};

export default function PayPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const intentId = searchParams.get("intentId");
  const [intent, setIntent] = useState<IntentData | null>(null);
  const [pricing, setPricing] = useState<{ rateUsd?: number | null } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [signature, setSignature] = useState("");
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [bypassAvailable, setBypassAvailable] = useState(false);
  const [bypassLoading, setBypassLoading] = useState(false);

  const fetchIntent = useCallback(async () => {
    if (!intentId) return;
    const res = await fetch(`/api/org-setup/intents/${intentId}`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = await res.json();
      setIntent(data);
      if (data.expiresAt) {
        const diff = new Date(data.expiresAt).getTime() - Date.now();
        setTimeLeft(Math.max(0, Math.floor(diff / 1000)));
      }
    } else {
      setError("Intent not found");
    }
  }, [intentId]);

  const checkPayment = useCallback(async () => {
    if (!intentId) return;
    const res = await fetchWithCsrf(`/api/org-setup/intents/${intentId}/check`, {
      method: "POST",
    });
    const data = await res.json();
    if (data.status === "PAID") {
      router.push(`/onboarding/terms?orgId=${intent?.organizationId ?? data.organizationId}`);
      return;
    }
    if (data.status === "EXPIRED") {
      setError("Payment intent has expired");
    }
  }, [intentId, intent?.organizationId, router]);

  useEffect(() => {
    if (!intentId) {
      setError("Missing intent ID");
      return;
    }
    fetchIntent();
  }, [intentId, fetchIntent]);

  useEffect(() => {
    fetch("/api/pricing", { cache: "no-store" })
      .then((r) => r.json())
      .then(setPricing)
      .catch(() => setPricing({}));
  }, []);

  useEffect(() => {
    fetch("/api/org-setup/bypass-available")
      .then((r) => r.json())
      .then((d) => setBypassAvailable(d.available === true))
      .catch(() => setBypassAvailable(false));
  }, []);

  useEffect(() => {
    if (!intentId || intent?.status === "PAID") return;
    const id = setInterval(checkPayment, 10_000);
    return () => clearInterval(id);
  }, [intentId, intent?.status, checkPayment]);

  useEffect(() => {
    if (timeLeft == null || timeLeft <= 0) return;
    const id = setInterval(() => setTimeLeft((t) => (t != null && t > 0 ? t - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [timeLeft]);

  async function handleSubmitTx(e: React.FormEvent) {
    e.preventDefault();
    if (!intentId || !signature.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetchWithCsrf(`/api/org-setup/intents/${intentId}/submit-tx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature: signature.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Verification failed");
        return;
      }
      if (data.status === "PAID") {
        router.push(`/onboarding/terms?orgId=${intent?.organizationId}`);
        return;
      }
      if (data.overpaidSol === "contact_support") {
        setError("Overpayment received. Contact support for refund.");
      }
      setSignature("");
      fetchIntent();
      checkPayment();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleBypass() {
    if (!intentId) return;
    setError("");
    setBypassLoading(true);
    try {
      const res = await fetchWithCsrf(`/api/org-setup/intents/${intentId}/bypass`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Bypass failed");
        return;
      }
      router.push(`/onboarding/terms?orgId=${data.organizationId ?? intent?.organizationId}`);
    } catch {
      setError("Something went wrong");
    } finally {
      setBypassLoading(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  if (!intentId) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-red-700">Missing payment intent. Start from the create org step.</p>
        <Link href="/onboarding/create-org" className="mt-2 inline-block text-sm font-medium text-red-800 hover:underline">
          Create organization
        </Link>
      </div>
    );
  }

  if (error && !intent) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-red-700">{error}</p>
        <Link href="/onboarding/create-org" className="mt-2 inline-block text-sm font-medium text-red-800 hover:underline">
          Start over
        </Link>
      </div>
    );
  }

  if (!intent) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6">Loading…</div>;
  }

  const remainingLamports = BigInt(intent.requiredLamports) - BigInt(intent.paidLamports);
  const overpaidLamports = BigInt(intent.paidLamports) - BigInt(intent.requiredLamports);
  const LAMPORTS_PER_SOL = 1e9;
  const usdEstimate =
    pricing?.rateUsd && parseFloat(intent.requiredSol) > 0
      ? (parseFloat(intent.requiredSol) * pricing.rateUsd).toFixed(2)
      : null;
  const overpaidSol = Number(overpaidLamports) / LAMPORTS_PER_SOL;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Pay setup fee</h1>
        <p className="mt-1 text-sm text-slate-600">
          {intent.useUniqueAddress
            ? "Send SOL to your unique deposit address. Works from any wallet or exchange — no memo needed."
            : "Send SOL to complete your organization setup. Include the memo to auto-verify."}
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-700">Amount</p>
            <p className="text-2xl font-bold text-slate-900">
              {intent.requiredSol} SOL
              {usdEstimate != null && (
                <span className="ml-2 text-base font-normal text-slate-600">
                  ≈ ${usdEstimate} USD
                </span>
              )}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700">
              {intent.useUniqueAddress ? "Your unique deposit address" : "Treasury address"}
            </p>
            <p className="text-xs text-slate-500">
              {intent.useUniqueAddress && "Send SOL from any wallet or exchange. Funds are automatically swept to our treasury."}
            </p>
            <div className="mt-1 flex gap-2">
              <code className="flex-1 truncate rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                {intent.depositPubkey}
              </code>
              <button
                type="button"
                onClick={() => copyToClipboard(intent.depositPubkey)}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Copy
              </button>
            </div>
          </div>

          {!intent.useUniqueAddress && (
            <div>
              <p className="text-sm font-medium text-slate-700">Memo / Reference (required)</p>
              <p className="text-xs text-amber-600">Include this memo to auto-verify your payment.</p>
              <div className="mt-1 flex gap-2">
                <code className="flex-1 truncate rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  {intent.reference}
                </code>
                <button
                  type="button"
                  onClick={() => copyToClipboard(intent.reference)}
                  className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {timeLeft != null && (
            <p className="text-sm text-slate-600">
              Expires in {Math.floor(timeLeft / 3600)}h {Math.floor((timeLeft % 3600) / 60)}m
            </p>
          )}
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <PayWithWallet
            depositAddress={intent.depositPubkey}
            useMemo={!intent.useUniqueAddress}
            reference={intent.reference}
            lamports={remainingLamports.toString()}
            onSignature={async (sig) => {
              setSignature(sig);
              setError("");
              setLoading(true);
              try {
                const res = await fetchWithCsrf(`/api/org-setup/intents/${intentId}/submit-tx`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ signature: sig.trim() }),
                });
                const data = await res.json();
                if (!res.ok) {
                  setError(data.error ?? "Verification failed");
                  return;
                }
                if (data.status === "PAID") {
                  router.push(`/onboarding/terms?orgId=${intent?.organizationId}`);
                  return;
                }
                fetchIntent();
                checkPayment();
              } catch {
                setError("Something went wrong");
              } finally {
                setLoading(false);
              }
            }}
            onError={setError}
            disabled={loading || remainingLamports <= BigInt(0)}
          />
          <p className="mt-4 text-xs text-slate-500">
            {intent.useUniqueAddress
              ? "Or send SOL from any exchange or wallet to your address above, then paste the transaction signature below."
              : "Or copy the treasury address and memo above, send SOL manually, then paste the transaction signature below."}
          </p>
        </div>

        <form onSubmit={handleSubmitTx} className="mt-6">
          <label htmlFor="sig" className="block text-sm font-medium text-slate-700">
            I paid manually — paste transaction signature
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="sig"
              type="text"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Transaction signature from Explorer"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Verifying…" : "Check payment"}
            </button>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={checkPayment}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Check payment status
          </button>
          {bypassAvailable && (
            <button
              type="button"
              onClick={handleBypass}
              disabled={bypassLoading}
              className="rounded border border-amber-400 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              {bypassLoading ? "Bypassing…" : "Bypass payment (for testing)"}
            </button>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {intent.status === "PENDING" && remainingLamports > BigInt(0) && (
          <p className="mt-4 text-sm text-amber-700">
            Paid so far: {(Number(intent.paidLamports) / LAMPORTS_PER_SOL).toFixed(6)} SOL.
            Remaining: {(Number(remainingLamports) / LAMPORTS_PER_SOL).toFixed(6)} SOL.
          </p>
        )}

        {overpaidSol > 1 && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="font-medium text-amber-800">Overpayment &gt; 1 SOL</p>
            <p className="text-sm text-amber-700">Contact support for refund.</p>
          </div>
        )}
      </div>
    </div>
  );
}
