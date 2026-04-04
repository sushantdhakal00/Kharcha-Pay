/**
 * Startup check: receipt storage dir exists and is writable.
 * Import from instrumentation.ts to fail fast if misconfigured.
 */
import { getReceiptStorageDirSync } from "./receipt-storage";
import { mkdir, access } from "fs/promises";
import { constants } from "fs";
import path from "path";

export async function ensureReceiptStorageReady(): Promise<void> {
  const dir = getReceiptStorageDirSync();
  try {
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK | constants.R_OK);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `[receipt-storage] Receipt storage dir not usable: ${dir}. Ensure it exists and is writable. Error: ${msg}`
    );
    throw new Error(
      `Receipt storage not ready. Set RECEIPT_STORAGE_DIR or ensure .data/receipts is writable.`
    );
  }
}
