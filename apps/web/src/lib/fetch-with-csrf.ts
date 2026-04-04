/**
 * CSRF-safe fetch: ensures x-csrf-token header is set on state-changing requests.
 * Call getCsrfToken() once per page load (e.g. in app layout or first mutation).
 */

let csrfTokenPromise: Promise<string> | null = null;

export async function getCsrfToken(): Promise<string> {
  if (csrfTokenPromise) return csrfTokenPromise;
  csrfTokenPromise = fetch("/api/csrf", { credentials: "include" })
    .then((r) => r.json())
    .then((data) => {
      if (data.csrfToken) return data.csrfToken;
      throw new Error("No CSRF token in response");
    });
  return csrfTokenPromise;
}

export function clearCsrfCache(): void {
  csrfTokenPromise = null;
}

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

async function doFetch(
  input: RequestInfo | URL,
  init: RequestInit,
  token: string | null
): Promise<Response> {
  const opts = { ...init, credentials: init?.credentials ?? "include" };
  if (token) {
    opts.headers = new Headers(init?.headers ?? {});
    opts.headers.set("x-csrf-token", token);
  }
  return fetch(input, opts);
}

export async function fetchWithCsrf(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const method = (init?.method ?? (typeof input === "string" ? "GET" : "GET")).toUpperCase();
  const opts = { ...init, credentials: init?.credentials ?? "include" };
  const isMutation = MUTATION_METHODS.has(method);

  const token = isMutation ? await getCsrfToken() : null;
  let res = await doFetch(input, opts, token);

  // On CSRF 403: clear cache, fetch fresh token, retry once
  if (isMutation && res.status === 403) {
    let data: { code?: string };
    try {
      data = await res.clone().json();
    } catch {
      return res;
    }
    if (data?.code === "CSRF") {
      clearCsrfCache();
      const freshToken = await getCsrfToken();
      res = await doFetch(input, opts, freshToken);
    }
  }

  return res;
}
