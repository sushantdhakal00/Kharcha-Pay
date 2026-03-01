"use client";

import { useState } from "react";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

interface ReauthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}

export function ReauthModal({ open, onClose, onSuccess }: ReauthModalProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetchWithCsrf("/api/auth/reauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Re-auth failed");
        return;
      }
      setPassword("");
      onClose();
      await onSuccess();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 dark:bg-black/60">
      <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg dark:bg-zinc-800 dark:border dark:border-zinc-700">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-stone-100">Re-enter password to continue</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-stone-400">
          This action requires recent authentication.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-stone-300">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
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
              {loading ? "Verifying…" : "Continue"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-600 dark:text-stone-300 dark:hover:bg-zinc-700"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
