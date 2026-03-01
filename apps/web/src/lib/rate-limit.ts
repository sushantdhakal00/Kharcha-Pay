const store = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_CHECK = 30;
const MAX_SUBMIT_TX = 10;
const MAX_LOGIN_ATTEMPTS = 10;

function getLoginKey(identifier: string): string {
  return `login:${identifier}`;
}

export function isRateLimited(identifier: string): boolean {
  const key = getLoginKey(identifier);
  const entry = store.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    store.delete(key);
    return false;
  }
  return entry.count >= MAX_LOGIN_ATTEMPTS;
}

export function recordLoginAttempt(identifier: string): void {
  const key = getLoginKey(identifier);
  const now = Date.now();
  const entry = store.get(key);
  if (!entry) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else if (now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count++;
  }
}

export function checkRateLimit(key: string, max: number): boolean {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

export function checkOrgSetupRateLimit(userId: string, action: "check" | "submitTx"): boolean {
  const max = action === "check" ? MAX_CHECK : MAX_SUBMIT_TX;
  return checkRateLimit(`org-setup:${action}:${userId}`, max);
}
