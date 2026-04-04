"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      setSent(true);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto mt-12 max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-stone-100">Check your email</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-stone-400">
          If an account exists with that email, we sent a reset link. In development, check the server console for the link.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm font-medium text-slate-900 hover:underline dark:text-stone-200">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-12 max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-stone-100">Forgot password</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-stone-400">
        Enter your email and we&apos;ll send a reset link (in dev, the link is logged to the server console).
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-stone-300">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
          />
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-stone-100 dark:text-zinc-900 dark:hover:bg-stone-200"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
          <Link
            href="/login"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-600 dark:text-stone-300 dark:hover:bg-zinc-700"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
