/**
 * Webhook delivery: HMAC signature, idempotency headers, retries.
 */
import { createHmac } from "crypto";

const TIMEOUT_MS = 8000;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
const MAX_ATTEMPTS = 8;

export function computeSignature(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(timestamp + "." + body).digest("hex");
}

export function getNextRetryAt(attemptNumber: number): Date | null {
  if (attemptNumber >= MAX_ATTEMPTS) return null;
  const delay = RETRY_DELAYS_MS[Math.min(attemptNumber, RETRY_DELAYS_MS.length - 1)] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  return new Date(Date.now() + delay);
}

export async function deliverWebhook(
  url: string,
  eventId: string,
  eventType: string,
  payload: unknown,
  secret: string
): Promise<{ status: number; bodySnippet: string; error?: string }> {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = computeSignature(secret, timestamp, body);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-KharchaPay-Event-Id": eventId,
        "X-KharchaPay-Event-Type": eventType,
        "X-KharchaPay-Timestamp": timestamp,
        "X-KharchaPay-Signature": "sha256=" + signature,
      },
      body,
      signal: controller.signal,
    });

    const text = await res.text();
    const snippet = text.slice(0, 500) + (text.length > 500 ? "…" : "");

    return {
      status: res.status,
      bodySnippet: snippet,
      ...(res.status >= 200 && res.status < 300 ? {} : { error: `HTTP ${res.status}` }),
    };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return { status: 0, bodySnippet: "", error: err };
  } finally {
    clearTimeout(timeout);
  }
}

export function shouldRetry(status: number, attemptNumber: number): boolean {
  if (attemptNumber >= MAX_ATTEMPTS) return false;
  if (status >= 200 && status < 300) return false;
  if (status >= 400 && status < 500 && status !== 429) return false;
  return true;
}
