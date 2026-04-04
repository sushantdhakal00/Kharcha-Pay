/**
 * Get client IP for rate limiting. Safe for Replit + Cloudflare.
 * When TRUST_PROXY=1: prefer CF-Connecting-IP, then X-Forwarded-For.
 * Always validate IP format; invalid → "unknown".
 * Uses process.env directly to avoid loading env module (Edge/middleware safe).
 */
const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_REGEX = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

function isValidIp(ip: string): boolean {
  if (!ip || ip.length > 45) return false;
  if (IPV4_REGEX.test(ip)) {
    const parts = ip.split(".");
    return parts.every((p) => {
      const n = parseInt(p, 10);
      return n >= 0 && n <= 255;
    });
  }
  return IPV6_REGEX.test(ip) || ip === "::1";
}

function getTrustProxy(): boolean {
  const v = process.env.TRUST_PROXY;
  return v === "1" || v === "true";
}

export function getClientIp(request: Request): string {
  const headers = request.headers;
  let ip: string | null = null;

  if (getTrustProxy()) {
    ip = headers.get("cf-connecting-ip")?.trim() ?? null;
    if (!ip) {
      const xff = headers.get("x-forwarded-for")?.trim();
      if (xff) {
        ip = xff.split(",")[0]?.trim() ?? null;
      }
    }
  }

  if (!ip) {
    ip = headers.get("x-real-ip")?.trim() ?? null;
  }

  if (!ip || !isValidIp(ip)) {
    return "unknown";
  }
  return ip;
}
