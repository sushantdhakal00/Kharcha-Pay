"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchWithCsrf, getCsrfToken } from "@/lib/fetch-with-csrf";
import { Avatar } from "@/components/avatar";

interface Member {
  id: string;
  userId: string;
  email: string;
  username: string;
  displayName?: string;
  avatarUrl?: string | null;
  role: string;
  createdAt: string;
}

export function MembersClient({ orgId }: { orgId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "APPROVER" | "STAFF">("STAFF");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/members`);
      const data = await res.json();
      if (res.ok) setMembers(data.members ?? []);
      else setError(data.error ?? "Failed to load (admin only)");
    } catch {
      setError("Failed to load");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  // Ensure CSRF token (and cookie) are ready before user can submit
  useEffect(() => {
    getCsrfToken().catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add member");
        return;
      }
      setEmail("");
      load();
    } catch {
      setError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="mt-4 text-sm text-slate-600">Loading…</p>;

  return (
    <div className="mt-6 space-y-6">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            required
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "ADMIN" | "APPROVER" | "STAFF")}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="STAFF">Staff</option>
            <option value="APPROVER">Approver</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add member"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {members.length === 0 ? (
          <li className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">No members yet.</li>
        ) : (
          members.map((m) => (
            <li key={m.id} className="flex items-center gap-4 border-t border-slate-100 px-4 py-3 first:border-t-0 dark:border-slate-700">
              <Avatar
                src={m.avatarUrl ?? null}
                displayName={m.displayName ?? m.username}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {m.displayName ?? m.username}
                </p>
                <p className="truncate text-sm text-slate-500 dark:text-slate-400">{m.email}</p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                {m.role}
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
