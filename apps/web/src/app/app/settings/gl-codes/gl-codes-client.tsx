"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

interface GLCode {
  id: string;
  code: string;
  name: string;
}

export function GLCodesClient({ orgId }: { orgId: string }) {
  const [codes, setCodes] = useState<GLCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/orgs/${orgId}/gl-codes`)
      .then((r) => r.json())
      .then((data) => setCodes(data.glCodes ?? []))
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!code.trim() || !name.trim()) return;
    setAdding(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/gl-codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim().toUpperCase(), name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add");
        return;
      }
      setCode("");
      setName("");
      load();
    } catch {
      setError("Failed to add");
    } finally {
      setAdding(false);
    }
  }

  if (loading) return <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Loading…</p>;

  return (
    <div className="mt-4 space-y-4">
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <form onSubmit={add} className="flex gap-2">
        <input
          type="text"
          placeholder="Code (e.g. 4100)"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={adding}
          className="rounded bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          Add
        </button>
      </form>
      <div className="rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Code</th>
              <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Name</th>
            </tr>
          </thead>
          <tbody>
            {codes.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-slate-500 dark:text-slate-400">
                  No GL codes yet. Add codes for invoice coding.
                </td>
              </tr>
            ) : (
              codes.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                  <td className="px-4 py-2 font-medium text-slate-900 dark:text-slate-100">{c.code}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{c.name}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
