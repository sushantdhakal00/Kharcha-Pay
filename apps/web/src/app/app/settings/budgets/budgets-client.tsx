"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

interface Department {
  id: string;
  name: string;
}

interface Budget {
  id: string;
  departmentId: string;
  departmentName: string;
  year: number;
  month: number;
  amountMinor: number;
  currency: string;
}

export function BudgetsClient({ orgId }: { orgId: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadDepts = useCallback(async () => {
    const res = await fetch(`/api/orgs/${orgId}/departments`);
    const data = await res.json();
    if (res.ok) setDepartments(data.departments ?? []);
  }, [orgId]);

  const loadBudgets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/budgets?year=${year}&month=${month}`);
      const data = await res.json();
      if (res.ok) {
        setBudgets(data.budgets ?? []);
        const next: Record<string, string> = {};
        (data.budgets ?? []).forEach((b: Budget) => {
          next[b.departmentId] = String(b.amountMinor);
        });
        setAmounts(next);
      } else setError(data.error ?? "Failed to load");
    } catch {
      setError("Failed to load");
    } finally {
      setLoading(false);
    }
  }, [orgId, year, month]);

  useEffect(() => {
    loadDepts();
  }, [loadDepts]);

  useEffect(() => {
    if (orgId) loadBudgets();
  }, [loadBudgets, orgId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      for (const dept of departments) {
        const raw = amounts[dept.id] ?? "0";
        const amountMinor = parseInt(raw, 10);
        if (isNaN(amountMinor) || amountMinor < 0) continue;
        await fetchWithCsrf(`/api/orgs/${orgId}/budgets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            departmentId: dept.id,
            year,
            month,
            amountMinor,
            currency: "NPR",
          }),
        });
      }
      loadBudgets();
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  if (loading && budgets.length === 0) return <p className="mt-4 text-sm text-slate-600">Loading…</p>;

  return (
    <div className="mt-6">
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              className="mt-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value, 10))}
              className="mt-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              {months.map((_, i) => (
                <option key={i} value={i + 1}>{months[i]}</option>
              ))}
            </select>
          </div>
        </div>
        {departments.length === 0 ? (
          <p className="text-sm text-slate-500">Add departments first.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2 text-left font-medium text-slate-700">Department</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-700">Amount (minor units)</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-4 py-2">{d.name}</td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        value={amounts[d.id] ?? ""}
                        onChange={(e) => setAmounts((prev) => ({ ...prev, [d.id]: e.target.value }))}
                        className="w-32 rounded border border-slate-300 px-2 py-1"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving || departments.length === 0}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save budgets"}
        </button>
      </form>
    </div>
  );
}
