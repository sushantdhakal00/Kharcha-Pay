/**
 * In-memory rate limiter for single instance. Key by userId (auth) or clientIp (anon).
 * Returns { limited: true, retryAfterSeconds } when over limit.
 */
import { getClientIp } from "./client-ip";

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

export type RouteGroup =
  | "auth:login"
  | "auth:forgot-password"
  | "auth:reset-password"
  | "demo:start"
  | "demo:reset"
  | "receipt:upload"
  | "receipt:download"
  | "reconcile:run"
  | "export"
  | "global";

const LIMITS: Record<RouteGroup, { windowMs: number; max: number }> = {
  "auth:login": { windowMs: 60_000, max: 10 },
  "auth:forgot-password": { windowMs: 60_000, max: 5 },
  "auth:reset-password": { windowMs: 60_000, max: 5 },
  "demo:start": { windowMs: 60_000, max: 10 },
  "demo:reset": { windowMs: 60_000, max: 3 },
  "receipt:upload": { windowMs: 60_000, max: 10 },
  "receipt:download": { windowMs: 60_000, max: 60 },
  "reconcile:run": { windowMs: 60_000, max: 5 },
  "export": { windowMs: 60_000, max: 20 },
  "global": { windowMs: 60_000, max: 200 },
};

function getKey(route: RouteGroup, identifier: string): string {
  return `${route}:${identifier}`;
}

function prune(): void {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (now > v.resetAt) store.delete(k);
  }
}

export function checkRateLimit(
  request: Request,
  route: RouteGroup,
  userId?: string | null
): { limited: false } | { limited: true; retryAfterSeconds: number } {
  prune();

  const identifier = userId ?? getClientIp(request);
  const limit = LIMITS[route];
  const key = getKey(route, identifier);
  const now = Date.now();

  let entry = store.get(key);
  if (!entry) {
    entry = { count: 1, resetAt: now + limit.windowMs };
    store.set(key, entry);
    return { limited: false };
  }

  if (now > entry.resetAt) {
    entry = { count: 1, resetAt: now + limit.windowMs };
    store.set(key, entry);
    return { limited: false };
  }

  entry.count += 1;
  if (entry.count > limit.max) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    return { limited: true, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
  }

  return { limited: false };
}

export function checkGlobalLimit(request: Request): { limited: false } | { limited: true; retryAfterSeconds: number } {
  return checkRateLimit(request, "global", null);
}
