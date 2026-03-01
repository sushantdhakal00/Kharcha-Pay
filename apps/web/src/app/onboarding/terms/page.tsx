"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

export default function TermsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgId = searchParams.get("orgId");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !agreed) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetchWithCsrf(`/api/org-setup/orgs/${orgId}/accept-terms`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to accept terms");
        return;
      }
      router.push(data.redirectUrl ?? "/app/setup");
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!orgId) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-red-700">Missing organization. Complete payment first.</p>
        <Link href="/onboarding/create-org" className="mt-2 inline-block text-sm font-medium text-red-800 hover:underline">
          Create organization
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">Terms & Conditions</h1>
      <p className="mt-1 text-sm text-slate-600">
        Please read and accept the terms before activating your organization.
      </p>

      <div className="mt-6 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <h2 className="font-semibold text-slate-900">1. Service agreement</h2>
        <p className="mt-2">
          By using KharchaPay, you agree to use the service for lawful business expense management purposes only.
        </p>
        <h2 className="mt-4 font-semibold text-slate-900">2. Payment and fees</h2>
        <p className="mt-2">
          Organization setup fees are non-refundable except where required by law. Payments are processed on Solana mainnet.
        </p>
        <h2 className="mt-4 font-semibold text-slate-900">3. Data and privacy</h2>
        <p className="mt-2">
          You are responsible for the accuracy of data you submit. Receipt and expense data is stored securely.
        </p>
        <h2 className="mt-4 font-semibold text-slate-900">4. Acceptable use</h2>
        <p className="mt-2">
          You will not use the service for fraud, money laundering, or any illegal activity.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">
            I agree to the Terms & Conditions and accept the responsibilities outlined above.
          </span>
        </label>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={!agreed || loading}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "Activating…" : "Accept and continue"}
        </button>
      </form>
    </div>
  );
}
