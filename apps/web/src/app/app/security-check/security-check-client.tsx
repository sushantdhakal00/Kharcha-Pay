"use client";

import { useState, useEffect } from "react";
import { getCsrfToken } from "@/lib/fetch-with-csrf";
import { useReauth } from "@/components/csrf-and-reauth-provider";

/**
 * GET /api/orgs/[orgId]/reauth-test?maxAge=0
 * Returns 403 REAUTH_REQUIRED when authTime is older than maxAge (for testing).
 * We don't add a real route; we simulate by calling an endpoint that uses requireRecentAuth(1) - but that would require an org.
 * Simpler: call GET /api/me and a fake "sensitive" endpoint. Actually the spec says "simulate by setting maxAgeSeconds low".
 * So we need an API that accepts maxAge and returns REAUTH_REQUIRED if auth is older. Easiest: add a test route GET /api/auth/reauth-test?maxAge=1 that calls requireRecentAuth(1). Then frontend calls it, gets 403, shows reauth modal, user reauths, retries, gets 200.
 */
async function reauthTest(maxAgeSeconds: number): Promise<{ ok: boolean; code?: string }> {
  const res = await fetch(`/api/auth/reauth-test?maxAge=${maxAgeSeconds}`, {
    credentials: "include",
  });
  const data = await res.json();
  if (res.status === 403 && data.code === "REAUTH_REQUIRED") {
    return { ok: false, code: "REAUTH_REQUIRED" };
  }
  return { ok: res.ok };
}

export function SecurityCheckClient() {
  const [csrfPresent, setCsrfPresent] = useState<boolean | null>(null);
  const [reauthResult, setReauthResult] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const reauth = useReauth();

  useEffect(() => {
    getCsrfToken()
      .then((t) => setCsrfPresent(!!t))
      .catch(() => setCsrfPresent(false));
  }, []);

  async function runReauthFlow() {
    setLoading(true);
    setReauthResult("");
    try {
      const r = await reauthTest(1);
      if (r.code === "REAUTH_REQUIRED" && reauth) {
        reauth.showReauth(async () => {
          const r2 = await reauthTest(900);
          setReauthResult(r2.ok ? "Re-auth flow OK: re-authenticated and retry succeeded." : "Retry failed.");
        });
        setReauthResult("Re-auth required. Enter your password in the modal, then we’ll retry.");
      } else if (r.ok) {
        setReauthResult("Session is recent; no re-auth needed.");
      } else {
        setReauthResult("Unexpected response.");
      }
    } catch (e) {
      setReauthResult(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 space-y-6 max-w-lg">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">CSRF token</h2>
        <p className="mt-1 text-sm text-slate-600">
          {csrfPresent === null
            ? "Checking…"
            : csrfPresent
              ? "CSRF token is present (fetched from /api/csrf and cached for mutations)."
              : "CSRF token missing or failed to load."}
        </p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Re-auth flow</h2>
        <p className="mt-1 text-sm text-slate-600">
          Sensitive actions (pay, vendor wallet/status, spend policy, approval policy) require authentication within the last 15 minutes. If the server returns REAUTH_REQUIRED, a modal asks for your password; after re-auth, the action can be retried.
        </p>
        <button
          type="button"
          onClick={runReauthFlow}
          disabled={loading}
          className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "Running…" : "Simulate re-auth (calls test endpoint)"}
        </button>
        {reauthResult && (
          <p className="mt-2 text-sm text-slate-700">{reauthResult}</p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          If no test endpoint exists, the button may show an error; the re-auth modal and retry still work on real sensitive actions (e.g. Pay, Edit vendor, Save spend/approval policy).
        </p>
      </div>
    </div>
  );
}
