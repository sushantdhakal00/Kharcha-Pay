/**
 * Safe JSON response helper: serializes BigInt to string so NextResponse.json()
 * never throws. Use for API routes that may return Prisma models with amountMinor etc.
 */
function bigIntReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  return value;
}

export function jsonResponse(
  data: object,
  init?: ResponseInit & { status?: number }
): Response {
  const status = init?.status ?? 200;
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return new Response(JSON.stringify(data, bigIntReplacer), {
    ...init,
    status,
    headers,
  });
}
