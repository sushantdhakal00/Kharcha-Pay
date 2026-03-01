"use client";

import { useState } from "react";

function getSpendRangeOptions(currency: string): { value: string; label: string }[] {
  const opts = [
    { value: "<1k", usd: "< $1,000", npr: "< Rs 1,00,000", eur: "< €1,000", gbp: "< £1,000" },
    { value: "1k-10k", usd: "$1,000 - $10,000", npr: "Rs 1,00,000 - Rs 10,00,000", eur: "€1,000 - €10,000", gbp: "£1,000 - £10,000" },
    { value: "10k-100k", usd: "$10,000 - $100,000", npr: "Rs 10,00,000 - Rs 1,00,00,000", eur: "€10,000 - €100,000", gbp: "£10,000 - £100,000" },
    { value: ">100k", usd: "> $100,000", npr: "> Rs 1,00,00,000", eur: "> €100,000", gbp: "> £100,000" },
  ];
  const key = currency === "NPR" ? "npr" : currency === "EUR" ? "eur" : currency === "GBP" ? "gbp" : "usd";
  return opts.map(({ value, ...rest }) => ({ value, label: rest[key] }));
}

import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

export default function CreateOrgPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [orgSize, setOrgSize] = useState("");
  const [country, setCountry] = useState("");
  const [timezone, setTimezone] = useState("");
  const [expectedMonthlySpendRange, setExpectedMonthlySpendRange] = useState("");
  const [primaryUseCase, setPrimaryUseCase] = useState("");
  const [referral, setReferral] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const slugFromName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetchWithCsrf("/api/org-setup/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: (slug || slugFromName).trim() || slugFromName,
          defaultCurrency: defaultCurrency || undefined,
          orgSize: orgSize || undefined,
          country: country || undefined,
          timezone: timezone || undefined,
          expectedMonthlySpendRange: expectedMonthlySpendRange || undefined,
          primaryUseCase: primaryUseCase || undefined,
          referral: referral || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create organization");
        return;
      }
      router.push(`/onboarding/pay?intentId=${data.intentId}`);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">Create organization</h1>
      <p className="mt-1 text-sm text-slate-600">
        Fill in the details below. You&apos;ll pay a one-time setup fee on the next step.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-700">
            Organization name *
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => {
              const n = e.target.value;
              setName(n);
              if (!slug)
                setSlug(
                  n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
                );
            }}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <div>
          <label htmlFor="slug" className="block text-sm font-medium text-slate-700">
            Slug (URL-friendly) *
          </label>
          <input
            id="slug"
            type="text"
            value={slug}
            onChange={(e) =>
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
            }
            placeholder={slugFromName || "my-org"}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <div>
          <label htmlFor="currency" className="block text-sm font-medium text-slate-700">
            Default currency
          </label>
          <select
            id="currency"
            value={defaultCurrency}
            onChange={(e) => setDefaultCurrency(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          >
            <option value="USD">USD</option>
            <option value="NPR">NPR</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
        <div>
          <label htmlFor="orgSize" className="block text-sm font-medium text-slate-700">
            Organization size
          </label>
          <select
            id="orgSize"
            value={orgSize}
            onChange={(e) => setOrgSize(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          >
            <option value="">Select</option>
            <option value="1-10">1-10</option>
            <option value="11-50">11-50</option>
            <option value="51-200">51-200</option>
            <option value="200+">200+</option>
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="country" className="block text-sm font-medium text-slate-700">
              Country
            </label>
            <input
              id="country"
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g. United States"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
          <div>
            <label htmlFor="timezone" className="block text-sm font-medium text-slate-700">
              Timezone
            </label>
            <input
              id="timezone"
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g. America/New_York"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            />
          </div>
        </div>
        <div>
          <label htmlFor="spend" className="block text-sm font-medium text-slate-700">
            Expected monthly spend range
          </label>
          <select
            id="spend"
            value={expectedMonthlySpendRange}
            onChange={(e) => setExpectedMonthlySpendRange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          >
            <option value="">Select</option>
            {getSpendRangeOptions(defaultCurrency).map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="useCase" className="block text-sm font-medium text-slate-700">
            Primary use case
          </label>
          <select
            id="useCase"
            value={primaryUseCase}
            onChange={(e) => setPrimaryUseCase(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          >
            <option value="">Select</option>
            <option value="expense_approvals">Expense approvals</option>
            <option value="vendor_payments">Vendor payments</option>
            <option value="audit_compliance">Audit & compliance</option>
          </select>
        </div>
        <div>
          <label htmlFor="referral" className="block text-sm font-medium text-slate-700">
            Referral (optional)
          </label>
          <input
            id="referral"
            type="text"
            value={referral}
            onChange={(e) => setReferral(e.target.value)}
            placeholder="How did you hear about us?"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Creating…" : "Continue to payment"}
          </button>
          <Link
            href="/app"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
