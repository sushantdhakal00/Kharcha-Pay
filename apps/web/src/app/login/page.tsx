"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/app";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      window.location.href = redirectTo + (redirectTo.includes('?') ? '&' : '?') + '_t=' + Date.now();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-stone-100">Log in</h1>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-stone-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-stone-300">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-stone-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-500"
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-stone-100 dark:text-zinc-900 dark:hover:bg-stone-200"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-center text-sm text-slate-600 dark:text-stone-400">
            <Link href="/forgot-password" className="font-medium text-slate-900 hover:underline dark:text-stone-200">
              Forgot password?
            </Link>
          </p>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600 dark:text-stone-400">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium text-slate-900 hover:underline dark:text-stone-200">
            Sign up
          </Link>
        </p>
      </div>
      <Link href="/" className="mt-4 text-sm text-slate-500 hover:text-slate-700 dark:text-stone-500 dark:hover:text-stone-300">
        Back to home
      </Link>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center"><div className="text-slate-500">Loading…</div></main>}>
      <LoginForm />
    </Suspense>
  );
}
