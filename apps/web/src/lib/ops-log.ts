/**
 * Structured ops logging for production debugging.
 * JSON format; no secrets, emails, or file paths.
 */
import { env } from "./env";

type LogLevel = "debug" | "info" | "warn" | "error";
const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function shouldLog(level: LogLevel): boolean {
  const config = env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  const threshold = config && LEVELS[config] !== undefined ? LEVELS[config] : 1;
  return LEVELS[level] >= threshold;
}

function log(level: LogLevel, event: string, data?: Record<string, unknown>) {
  if (!shouldLog(level)) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  const out = JSON.stringify(entry);
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.log(out);
}

export const opsLog = {
  authSuccess: () => log("info", "auth.login.success", { count: 1 }),
  authFailure: (reason: "invalid_credentials" | "rate_limited") =>
    log("info", "auth.login.failure", { reason }),

  paySuccess: (requestId: string) =>
    log("info", "pay.success", { requestId }),
  payFailure: (requestId: string, code: string) =>
    log("info", "pay.failure", { requestId, code }),

  reconcileComplete: (orgId: string, total: number, verified: number, failed: number, durationMs: number) =>
    log("info", "reconcile.complete", { orgId, total, verified, failed, durationMs }),
  reconcileError: (orgId: string, errorCode: string) =>
    log("warn", "reconcile.error", { orgId, errorCode }),

  receiptUploadError: (reason: string) =>
    log("warn", "receipt.upload.error", { reason }),
  receiptDownloadError: (reason: string) =>
    log("warn", "receipt.download.error", { reason }),
};
