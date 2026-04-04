#!/usr/bin/env npx tsx
/**
 * Post-deploy smoke for Replit. Validates health endpoints.
 * Usage: NEXT_PUBLIC_APP_URL=https://... HEALTH_ADMIN_TOKEN=... npx tsx scripts/replit-postdeploy-smoke.ts
 */
const BASE = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
const HEALTH_TOKEN = process.env.HEALTH_ADMIN_TOKEN;

if (!BASE) {
  console.error("Set NEXT_PUBLIC_APP_URL");
  process.exit(1);
}

const headers: Record<string, string> = { "Accept": "application/json" };
if (HEALTH_TOKEN) {
  headers["Authorization"] = `Bearer ${HEALTH_TOKEN}`;
  headers["X-Health-Token"] = HEALTH_TOKEN;
}

async function get(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE}${path}`, { headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

let failed = 0;

async function run() {
  console.log("Replit post-deploy smoke →", BASE, "\n");

  const health = await get("/api/health");
  if (health.status === 200 && (health.body as { ok?: boolean }).ok === true) {
    console.log("PASS  GET /api/health → 200");
  } else {
    console.error("FAIL  GET /api/health →", health.status, health.body);
    failed++;
  }

  const db = await get("/api/health/db");
  if (db.status === 200 && (db.body as { ok?: boolean }).ok === true) {
    console.log("PASS  GET /api/health/db → 200");
  } else if (db.status === 401 && !HEALTH_TOKEN) {
    console.log("SKIP  GET /api/health/db (401, HEALTH_ADMIN_TOKEN not set)");
  } else if (db.status === 401) {
    console.error("FAIL  GET /api/health/db → 401 (bad token?)");
    failed++;
  } else {
    console.error("FAIL  GET /api/health/db →", db.status, db.body);
    failed++;
  }

  if (process.env.REDIS_URL) {
    const redis = await get("/api/health/redis");
    if (redis.status === 200 && ((redis.body as { ok?: boolean }).ok === true || (redis.body as { redis?: string }).redis === "ok")) {
      console.log("PASS  GET /api/health/redis → 200");
    } else if (redis.status === 401 && !HEALTH_TOKEN) {
      console.log("SKIP  GET /api/health/redis (401, HEALTH_ADMIN_TOKEN not set)");
    } else {
      console.error("FAIL  GET /api/health/redis →", redis.status, redis.body);
      failed++;
    }
  } else {
    console.log("SKIP  GET /api/health/redis (REDIS_URL not set)");
  }

  const cron = await get("/api/health/cron");
  if (cron.status === 200) {
    const body = cron.body as { cron?: Record<string, unknown> };
    const entries = body.cron ? Object.keys(body.cron).length : 0;
    console.log("PASS  GET /api/health/cron → 200", entries ? `(${entries} cron types)` : "(no runs yet)");
  } else if (cron.status === 401 && !HEALTH_TOKEN) {
    console.log("SKIP  GET /api/health/cron (401, HEALTH_ADMIN_TOKEN not set)");
  } else {
    console.error("FAIL  GET /api/health/cron →", cron.status, cron.body);
    failed++;
  }

  if (failed > 0) {
    console.error("\n", failed, "check(s) failed");
    process.exit(1);
  }
  console.log("\nAll checks passed.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
