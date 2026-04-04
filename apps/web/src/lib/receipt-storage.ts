/**
 * Receipt file storage outside public/. Stable path for Replit and local dev.
 * Use RECEIPT_STORAGE_DIR env to override. Ensures dir exists and is writable at startup.
 */
import path from "path";
import { mkdir, access } from "fs/promises";
import { constants } from "fs";

const DATA_DIR_NAME = ".data";
const RECEIPTS_DIR_NAME = "receipts";

function getBaseDir(): string {
  const override = process.env.RECEIPT_STORAGE_DIR?.trim();
  if (override) return override;
  const cwd = process.cwd();
  const home = process.env.HOME ?? "";
  const isReplit = home.startsWith("/home/runner");
  return isReplit
    ? path.join(home, DATA_DIR_NAME, RECEIPTS_DIR_NAME)
    : path.join(cwd, DATA_DIR_NAME, RECEIPTS_DIR_NAME);
}

/**
 * Returns the directory for storing receipt files. Ensures the directory exists.
 */
export async function getReceiptStorageDir(): Promise<string> {
  const baseDir = getBaseDir();
  await mkdir(baseDir, { recursive: true });
  return baseDir;
}

/**
 * Synchronous version. Use getBaseDir for path; caller must ensure dir exists for writes.
 */
export function getReceiptStorageDirSync(): string {
  return getBaseDir();
}
