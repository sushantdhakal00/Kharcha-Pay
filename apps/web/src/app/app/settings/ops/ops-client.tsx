"use client";

import { useState } from "react";
import { fetchWithCsrf } from "@/lib/fetch-with-csrf";

interface Diagnostics {
  env: {
    databaseUrl: boolean;
    jwtSecret: boolean;
    solanaRpcUrl: boolean;
    treasuryKeypair: boolean;
    nextPublicAppUrl: boolean;
  };
  dbConnected: boolean;
  solanaOk: boolean;
  solanaBlockhash: string | null;
}

export function OpsClient({ orgId }: { orgId: string }) {
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{ deletedCount: number; retentionDays: number } | null>(null);
  const [cleanupError, setCleanupError] = useState("");
  const [diagLoading, setDiagLoading] = useState(false);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [diagError, setDiagError] = useState("");

  async function runAuditCleanup() {
    setCleanupError("");
    setCleanupResult(null);
    setCleanupLoading(true);
    try {
      const res = await fetchWithCsrf(`/api/orgs/${orgId}/audit-retention/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setCleanupError(data.error ?? "Cleanup failed");
        return;
      }
      setCleanupResult({ deletedCount: data.deletedCount ?? 0, retentionDays: data.retentionDays ?? 365 });
    } catch {
      setCleanupError("Cleanup failed");
    } finally {
      setCleanupLoading(false);
    }
  }

  async function showDiagnostics() {
    setDiagError("");
    setDiag(null);
    setDiagLoading(true);
    try {
      const res = await fetch(`/api/ops/diagnostics?orgId=${encodeURIComponent(orgId)}`);
      const data = await res.json();
      if (!res.ok) {
        setDiagError(data.error ?? "Failed to load diagnostics");
        return;
      }
      setDiag(data);
    } catch {
      setDiagError("Failed to load diagnostics");
    } finally {
      setDiagLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-medium text-slate-900">Audit retention cleanup</h2>
        <p className="mt-1 text-sm text-slate-600">
          Delete audit events older than the configured retention period for this org.
        </p>
        <button
          type="button"
          onClick={runAuditCleanup}
          disabled={cleanupLoading}
          className="mt-3 rounded bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-300 disabled:opacity-50"
        >
          {cleanupLoading ? "Running…" : "Run audit retention cleanup"}
        </button>
        {cleanupResult && (
          <p className="mt-2 text-sm text-green-700">
            Deleted {cleanupResult.deletedCount} event(s) older than {cleanupResult.retentionDays} days.
          </p>
        )}
        {cleanupError && <p className="mt-2 text-sm text-red-600">{cleanupError}</p>}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-medium text-slate-900">Env diagnostics (safe)</h2>
        <p className="mt-1 text-sm text-slate-600">
          Booleans only; no secret or URL values. Includes DB and Solana connection tests.
        </p>
        <button
          type="button"
          onClick={showDiagnostics}
          disabled={diagLoading}
          className="mt-3 rounded bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-300 disabled:opacity-50"
        >
          {diagLoading ? "Loading…" : "Show env diagnostics"}
        </button>
        {diagError && <p className="mt-2 text-sm text-red-600">{diagError}</p>}
        {diag && (
          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm font-mono">
            <p><strong>Env (set):</strong> DATABASE_URL={diag.env.databaseUrl ? "✓" : "✗"} JWT_SECRET={diag.env.jwtSecret ? "✓" : "✗"} SOLANA_RPC_URL={diag.env.solanaRpcUrl ? "✓" : "✗"} TREASURY_KEYPAIR_JSON={diag.env.treasuryKeypair ? "✓" : "✗"} NEXT_PUBLIC_APP_URL={diag.env.nextPublicAppUrl ? "✓" : "✗"}</p>
            <p className="mt-2"><strong>DB connection:</strong> {diag.dbConnected ? "OK" : "Error"}</p>
            <p><strong>Solana connection:</strong> {diag.solanaOk ? "OK" : "Error"}{diag.solanaBlockhash ? ` (blockhash: ${diag.solanaBlockhash.slice(0, 12)}…)` : ""}</p>
          </div>
        )}
      </div>
    </div>
  );
}
