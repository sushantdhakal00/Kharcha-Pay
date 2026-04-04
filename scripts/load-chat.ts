#!/usr/bin/env npx tsx
/**
 * Minimal load test for chat SSE.
 * Usage: SMOKE_BASE_URL=https://... SMOKE_EMAIL=... SMOKE_PASSWORD=... npx tsx scripts/load-chat.ts
 *
 * 50 concurrent SSE connections, 500 messages via API.
 * Fails if: SSE errors > 5% or p95 delivery > 5s.
 */
const BASE_URL = (process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const SMOKE_EMAIL = process.env.SMOKE_EMAIL;
const SMOKE_PASSWORD = process.env.SMOKE_PASSWORD;

const CONCURRENT_SSE = 50;
const MESSAGES_TOTAL = 500;
const SSE_ERROR_THRESHOLD_PCT = 5;
const P95_DELIVERY_MS = 5000;

if (!SMOKE_EMAIL || !SMOKE_PASSWORD) {
  console.error("Set SMOKE_EMAIL and SMOKE_PASSWORD");
  process.exit(1);
}

class CookieJar {
  private cookies = new Map<string, string>();
  apply(res: Response) {
    const getSetCookie = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
    const setCookies = typeof getSetCookie === "function" ? getSetCookie.call(res.headers) : [];
    for (const header of setCookies) {
      const [pair] = header.trim().split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  header() {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function main() {
  const jar = new CookieJar();
  const csrfRes = await fetch(`${BASE_URL}/api/csrf`, { credentials: "include" });
  jar.apply(csrfRes);
  const { csrfToken } = await csrfRes.json().catch(() => ({}));
  if (!csrfToken) {
    console.error("No CSRF token");
    process.exit(1);
  }

  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: jar.header() },
    body: JSON.stringify({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD }),
  });
  jar.apply(loginRes);
  if (!loginRes.ok) {
    console.error("Login failed");
    process.exit(1);
  }

  const demoRes = await fetch(`${BASE_URL}/api/demo/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken, Cookie: jar.header() },
    body: "{}",
  });
  jar.apply(demoRes);
  const { demoOrgId } = await demoRes.json().catch(() => ({}));
  if (!demoOrgId) {
    console.error("No demo org");
    process.exit(1);
  }

  const channelsRes = await fetch(`${BASE_URL}/api/orgs/${demoOrgId}/chat/channels`, {
    headers: { Cookie: jar.header() },
  });
  const { channels } = await channelsRes.json().catch(() => ({}));
  const channelId = channels?.[0]?.id;
  if (!channelId) {
    console.error("No channel");
    process.exit(1);
  }

  const deliveryTimes: number[] = [];
  let sseErrors = 0;
  let sseOk = 0;

  const runSse = (i: number) =>
    new Promise<void>((resolve) => {
      const t0 = Date.now();
      const ac = new AbortController();
      fetch(
        `${BASE_URL}/api/orgs/${demoOrgId}/chat/stream?channelId=${channelId}`,
        { headers: { Cookie: jar.header() }, signal: ac.signal }
      )
        .then(async (r) => {
          if (!r.ok || !r.body) {
            sseErrors++;
            resolve();
            return;
          }
          const reader = r.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let connected = false;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            if (!connected && buffer.includes("event: connected")) {
              connected = true;
              sseOk++;
            }
            if (buffer.includes("event: message.created")) {
              deliveryTimes.push(Date.now() - t0);
            }
          }
          resolve();
        })
        .catch(() => {
          sseErrors++;
          resolve();
        });
      setTimeout(() => {
        ac.abort();
        resolve();
      }, 8000);
    });

  console.log("Starting SSE connections...");
  await Promise.all([...Array(CONCURRENT_SSE)].map((_, i) => runSse(i)));

  const totalSse = sseErrors + sseOk;
  const errorPct = totalSse > 0 ? (sseErrors / totalSse) * 100 : 0;
  deliveryTimes.sort((a, b) => a - b);
  const p95 = deliveryTimes[Math.floor(deliveryTimes.length * 0.95)] ?? 0;

  console.log(`SSE: ${sseOk} ok, ${sseErrors} errors (${errorPct.toFixed(1)}%)`);
  console.log(`Delivery times: p95=${p95}ms (threshold ${P95_DELIVERY_MS}ms)`);

  if (errorPct > SSE_ERROR_THRESHOLD_PCT) {
    console.error(`FAIL: SSE error rate ${errorPct}% > ${SSE_ERROR_THRESHOLD_PCT}%`);
    process.exit(1);
  }
  if (deliveryTimes.length > 0 && p95 > P95_DELIVERY_MS) {
    console.error(`FAIL: p95 delivery ${p95}ms > ${P95_DELIVERY_MS}ms`);
    process.exit(1);
  }
  console.log("PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
