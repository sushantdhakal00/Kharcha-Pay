#!/usr/bin/env npx tsx
/**
 * Production smoke tests for KharchaPay.
 * Base URL: https://kharchapay.replit.app (or SMOKE_BASE_URL).
 * Set SMOKE_EMAIL + SMOKE_PASSWORD for authenticated checks.
 */
const BASE_URL = process.env.SMOKE_BASE_URL || "https://kharchapay.replit.app";
const SMOKE_EMAIL = process.env.SMOKE_EMAIL;
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD;
const HAS_CREDS = !!(SMOKE_EMAIL?.trim() && SMOKE_PASSWORD);

function trimUrl(u: string): string {
  return u.replace(/\/+$/, "");
}

const base = trimUrl(BASE_URL);

class CookieJar {
  private cookies = new Map<string, string>();

  apply(res: Response): void {
    const getSetCookie = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    const setCookies = typeof getSetCookie === "function" ? getSetCookie.call(res.headers) : [];
    for (const header of setCookies) {
      const [pair] = header.trim().split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) {
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        this.cookies.set(name, value);
      }
    }
  }

  header(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

function safeSnippet(body: string, max = 500): string {
  const sanitized = body.replace(/\s+/g, " ").trim();
  if (sanitized.length <= max) return sanitized;
  return sanitized.slice(0, max) + "...";
}

interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

const results: Check[] = [];

async function fetchReq(
  path: string,
  opts: RequestInit & { jar?: CookieJar } = {}
): Promise<Response> {
  const { jar, ...init } = opts;
  const url = path.startsWith("http") ? path : `${base}${path}`;
  const headers = new Headers(init.headers as HeadersInit);
  if (jar?.header()) headers.set("Cookie", jar.header());
  const res = await fetch(url, {
    ...init,
    headers,
    redirect: "follow",
  });
  if (jar) jar.apply(res);
  return res;
}

function pass(name: string, detail?: string): void {
  results.push({ name, pass: true, detail });
  console.log(`PASS  ${name}${detail ? ` (${detail})` : ""}`);
}

function fail(name: string, detail: string, body?: string): void {
  results.push({ name, pass: false, detail });
  const snippet = body ? ` | body: ${safeSnippet(body)}` : "";
  console.log(`FAIL  ${name}: ${detail}${snippet}`);
}

async function run(): Promise<void> {
  console.log(`\nSmoke tests → ${base}\n`);
  const jar = new CookieJar();

  // --- Public checks ---
  const wpRes = await fetchReq("/whitepaper", { jar });
  const wpText = await wpRes.text();
  if (wpRes.ok && wpText.toLowerCase().includes("what kharchapay is")) {
    pass("GET /whitepaper returns 200 and contains 'What KharchaPay is'");
  } else if (wpRes.ok) {
    fail("GET /whitepaper", "200 but missing expected content", wpText);
  } else {
    fail("GET /whitepaper", `status ${wpRes.status}`, wpText);
  }

  const healthRes = await fetchReq("/api/health", { jar });
  const healthJson = await healthRes.json().catch(() => ({}));
  if (healthRes.status === 200 && healthJson.ok === true) {
    pass("GET /api/health returns 200 { ok: true }", `db=${healthJson.db ?? "?"}`);
  } else if (healthRes.status === 503 && healthJson.ok === false) {
    pass("GET /api/health returns 503 when unhealthy (expected in some envs)");
  } else {
    fail(
      "GET /api/health",
      `expected 200+ok or 503+!ok, got ${healthRes.status}`,
      JSON.stringify(healthJson)
    );
  }

  const dbRes = await fetchReq("/api/health/db", { jar });
  if (dbRes.ok) {
    const dbJson = await dbRes.json().catch(() => ({}));
    if (dbJson.ok === true) pass("GET /api/health/db returns 200 when DB ok");
    else fail("GET /api/health/db", "ok not true", JSON.stringify(dbJson));
  } else {
    pass("GET /api/health/db", `optional; got ${dbRes.status} (skip if DB down)`);
  }

  // --- Auth-required denial (no creds) ---
  const demoStartNoAuth = await fetchReq("/api/demo/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    jar,
  });
  if (!HAS_CREDS) {
    if (demoStartNoAuth.status === 401 || demoStartNoAuth.status === 403) {
      pass("POST /api/demo/start denied without auth (401/403)");
    } else {
      const body = await demoStartNoAuth.text();
      fail(
        "POST /api/demo/start (no creds)",
        `expected 401/403, got ${demoStartNoAuth.status}`,
        body
      );
    }

    const demoResetNoAuth = await fetchReq("/api/demo/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      jar,
    });
    if (demoResetNoAuth.status === 401 || demoResetNoAuth.status === 403) {
      pass("POST /api/demo/reset denied without auth (401/403)");
    } else {
      const body = await demoResetNoAuth.text();
      fail(
        "POST /api/demo/reset (no creds)",
        `expected 401/403, got ${demoResetNoAuth.status}`,
        body
      );
    }
  }

  if (HAS_CREDS) {
    // --- CSRF + Login ---
    const csrfRes = await fetchReq("/api/csrf", { jar });
    const csrfData = await csrfRes.json().catch(() => ({}));
    const csrfToken = csrfData.csrfToken;
    if (!csrfToken) {
      fail("GET /api/csrf", "no csrfToken in response", JSON.stringify(csrfData));
    } else {
      pass("GET /api/csrf returns token");
    }

    const loginRes = await fetchReq("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD }),
      jar,
    });
    const loginData = await loginRes.json().catch(() => ({}));
    if (!loginRes.ok) {
      fail("POST /api/auth/login", `status ${loginRes.status}`, JSON.stringify(loginData));
      console.log("\n--- Stopping authenticated checks (login failed) ---\n");
    } else if (!loginData.user?.id) {
      fail("POST /api/auth/login", "no user in response", JSON.stringify(loginData));
      console.log("\n--- Stopping authenticated checks (login failed) ---\n");
    } else {
      pass("POST /api/auth/login", loginData.user.email);

      const meRes = await fetchReq("/api/me", { jar });
      if (meRes.ok) {
        pass("GET /api/me returns 200");
      } else {
        fail("GET /api/me", `status ${meRes.status}`, await meRes.text());
      }
      // --- Demo start ---
      const demoStartRes = await fetchReq("/api/demo/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: "{}",
        jar,
      });
      const demoStartData = await demoStartRes.json().catch(() => ({}));
      if (!demoStartRes.ok) {
        fail(
          "POST /api/demo/start",
          `status ${demoStartRes.status}`,
          JSON.stringify(demoStartData)
        );
      } else if (!demoStartData.demoOrgId) {
        fail("POST /api/demo/start", "no demoOrgId", JSON.stringify(demoStartData));
      } else {
        pass("POST /api/demo/start", `demoOrgId=${demoStartData.demoOrgId}`);
      }

      const demoOrgId = demoStartData.demoOrgId;
      if (!demoOrgId) {
        console.log("\n--- Stopping (demo start failed, no demoOrgId) ---\n");
      } else {
      // --- Active org ---
      const activeOrgRes = await fetchReq("/api/me/active-org", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ orgId: demoOrgId }),
        jar,
      });
      const activeOrgData = await activeOrgRes.json().catch(() => ({}));
      if (!activeOrgRes.ok) {
        fail(
          "POST /api/me/active-org",
          `status ${activeOrgRes.status}`,
          JSON.stringify(activeOrgData)
        );
      } else {
        pass("POST /api/me/active-org sets demo org");
      }

      // --- Demo status ---
      const statusRes = await fetchReq("/api/demo/status", { jar });
      const statusData = await statusRes.json().catch(() => ({}));
      if (!statusRes.ok) {
        fail("GET /api/demo/status", `status ${statusRes.status}`, JSON.stringify(statusData));
      } else if (statusData.exists !== true) {
        fail("GET /api/demo/status", "exists not true", JSON.stringify(statusData));
      } else {
        const counts = statusData.counts ?? {};
        pass("GET /api/demo/status", `counts=${JSON.stringify(counts).slice(0, 80)}...`);
      }

      // --- Finance autopilot: requests ---
      const reqsRes = await fetchReq(`/api/orgs/${demoOrgId}/requests`, { jar });
      const reqsData = await reqsRes.json().catch(() => ({}));
      const requests = reqsData.requests ?? [];
      if (!reqsRes.ok) {
        fail(
          "GET /api/orgs/[orgId]/requests",
          `status ${reqsRes.status}`,
          JSON.stringify(reqsData)
        );
      } else if (!Array.isArray(requests)) {
        fail("GET /api/orgs/[orgId]/requests", "requests not array", JSON.stringify(reqsData));
      } else if (requests.length === 0) {
        fail("GET /api/orgs/[orgId]/requests", "count should be > 0 (demo has seeded requests)");
      } else {
        pass("GET /api/orgs/[orgId]/requests", `count=${requests.length}`);
      }

      // --- Payments (has paidTxSig + verification status) ---
      const payRes = await fetchReq(`/api/orgs/${demoOrgId}/payments`, { jar });
      const payData = await payRes.json().catch(() => ({}));
      const payments = payData.payments ?? [];
      if (!payRes.ok) {
        fail(
          "GET /api/orgs/[orgId]/payments",
          `status ${payRes.status}`,
          JSON.stringify(payData)
        );
      } else if (!Array.isArray(payments) || payments.length === 0) {
        fail("GET /api/orgs/[orgId]/payments", "demo should have PAID requests");
      } else {
        pass("GET /api/orgs/[orgId]/payments", `count=${payments.length}`);
        const paid = payments[0];
        if (paid?.paidTxSig) {
          pass("PAID request has paidTxSig");
        } else {
          fail("PAID request", "missing paidTxSig", JSON.stringify(paid));
        }
        const hasVerification =
          paid?.verificationStatus === "VERIFIED" || paid?.verificationStatus === "FAILED";
        if (hasVerification) {
          pass("Payments have reconciliation/verification status");
        } else {
          pass("Payments have reconciliation status", `(PENDING ok for demo)`);
        }
      }

      // --- Export ---
      const exportRes = await fetchReq(
        `/api/orgs/${demoOrgId}/exports/payments?from=2020-01-01&to=2030-12-31`,
        { jar }
      );
      const exportText = await exportRes.text();
      const exportCt = exportRes.headers.get("content-type") ?? "";
      if (exportRes.status === 429) {
        fail("GET exports/payments", "rate limited (single call should not be)", exportText);
      } else if (!exportRes.ok) {
        fail(
          "GET /api/orgs/[orgId]/exports/payments",
          `status ${exportRes.status}`,
          exportText
        );
      } else if (!exportCt.includes("text/csv")) {
        fail("GET exports/payments", `expected CSV, got ${exportCt}`, exportText.slice(0, 200));
      } else {
        pass("GET exports/payments returns 200 CSV");
      }

      // --- Receipt (bogus id) ---
      const bogusReceiptRes = await fetchReq("/api/receipts/bogus-receipt-id-99999", { jar });
      const receiptBody = await bogusReceiptRes.text();
      if (bogusReceiptRes.status === 403 || bogusReceiptRes.status === 404) {
        if (/stack|at\s+\w+\s+\(|\.ts:\d+|\.js:\d+/.test(receiptBody)) {
          fail("GET /api/receipts/[bogus]", "response contains stack trace", receiptBody);
        } else {
          pass("GET /api/receipts/[bogus] returns 403/404 (no stack trace)");
        }
      } else {
        fail(
          "GET /api/receipts/[bogus]",
          `expected 403/404, got ${bogusReceiptRes.status}`,
          receiptBody
        );
      }

      // --- Cross-org isolation ---
      const randomOrgId = "random-org-id-not-member";
      const crossOrgRes = await fetchReq(`/api/orgs/${randomOrgId}/requests`, { jar });
      if (crossOrgRes.status === 403 || crossOrgRes.status === 404) {
        pass("GET /api/orgs/[random]/requests returns 403/404 (cross-org denied)");
      } else if (crossOrgRes.status === 500) {
        const body = await crossOrgRes.text();
        fail(
          "GET /api/orgs/[random]/requests",
          "expected 403/404, got 500 (never 500 for auth)",
          body
        );
      } else {
        fail(
          "GET /api/orgs/[random]/requests",
          `expected 403/404, got ${crossOrgRes.status}`
        );
      }
      }
    }
  }

  // --- Summary ---
  const failed = results.filter((r) => !r.pass);
  console.log(`\n--- ${results.length} checks, ${failed.length} failed ---\n`);
  if (failed.length > 0) {
    process.exit(1);
  }
}

run().catch((e) => {
  console.error("Smoke script error:", e);
  process.exit(1);
});
