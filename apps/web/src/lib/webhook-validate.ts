/**
 * Webhook URL validation: HTTPS only in production, block localhost/private IPs (SSRF).
 */
const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;
const PRIVATE_IP = /^https?:\/\/(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/i;

export function isValidWebhookUrl(url: string): { valid: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL" };
  }
  if (parsed.protocol !== "https:") {
    return { valid: false, error: "Webhook URL must use HTTPS" };
  }
  if (LOCALHOST.test(url) || PRIVATE_IP.test(url)) {
    return { valid: false, error: "localhost and private IPs are not allowed" };
  }
  return { valid: true };
}
