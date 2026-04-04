/**
 * QuickBooks Online API client.
 * Base URL: https://quickbooks.api.intuit.com/v3/company/{realmId}
 */
import { env } from "../env";

const QBO_BASE = "https://quickbooks.api.intuit.com/v3/company";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/revoke";

export const QBO_SCOPES = "com.intuit.quickbooks.accounting";
export const QBO_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";

export function getQboAuthUrl(redirectUri: string, state: string): string {
  const clientId = env.QUICKBOOKS_CLIENT_ID;
  if (!clientId) throw new Error("QUICKBOOKS_CLIENT_ID not configured");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: QBO_SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `${QBO_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number; realmId: string }> {
  const clientId = env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = env.QUICKBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("QuickBooks OAuth not configured");
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`QBO token exchange failed: ${res.status} ${err}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    realmId?: string;
  };
  const realmId = data.realmId ?? "";
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    realmId,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const clientId = env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = env.QUICKBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("QuickBooks OAuth not configured");
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`QBO token refresh failed: ${res.status} ${err}`);
  }
  return res.json();
}

export async function revokeToken(token: string): Promise<void> {
  const clientId = env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = env.QUICKBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return;
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  await fetch(REVOKE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: new URLSearchParams({ token }).toString(),
  });
}

export interface QboRequestOptions {
  realmId: string;
  accessToken: string;
  method?: "GET" | "POST" | "PUT";
  path: string;
  body?: object;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function qboRequest<T>(opts: QboRequestOptions): Promise<T> {
  const { realmId, accessToken, method = "GET", path, body } = opts;
  const url = `${QBO_BASE}/${realmId}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  if (body) headers["Content-Type"] = "application/json";

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) throw new Error("QBO_UNAUTHORIZED");
    const json = await res.json().catch(() => ({}));
    if (res.ok) return json as T;
    const msg = (json as { Fault?: { Error?: Array<{ Message?: string }> } }).Fault?.Error?.[0]?.Message ?? res.statusText;
    lastError = new Error(`QBO API ${res.status}: ${msg}`);
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      const backoff = Math.min(1000 * Math.pow(2, attempt), 30000);
      await sleep(backoff);
    } else {
      throw lastError;
    }
  }
  throw lastError ?? new Error("QBO request failed");
}

export async function qboQuery<T>(opts: Omit<QboRequestOptions, "method" | "body" | "path"> & { query: string }): Promise<T> {
  const { query, ...rest } = opts;
  return qboRequest<T>({ ...rest, path: `/query?query=${encodeURIComponent(query)}` });
}
