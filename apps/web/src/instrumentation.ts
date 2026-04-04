/**
 * Next.js instrumentation - runs when the server starts.
 * Ensures env validation and receipt storage check run at boot.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("@/lib/env");
    const { ensureReceiptStorageReady } = await import("@/lib/receipt-storage-init");
    await ensureReceiptStorageReady();
    if (env.NODE_ENV === "development") {
      console.log("[instrumentation] Env validated, receipt storage OK");
    }
  }
}
