/**
 * Vendor document storage. Org-scoped path under .data/vendor-documents/{orgId}/
 */
import path from "path";
import { mkdir } from "fs/promises";

const DATA_DIR_NAME = ".data";
const VENDOR_DOCS_DIR = "vendor-documents";

function getBaseDir(): string {
  const override = process.env.VENDOR_DOCUMENT_STORAGE_DIR?.trim();
  if (override) return override;
  return path.join(process.cwd(), DATA_DIR_NAME, VENDOR_DOCS_DIR);
}

export function getVendorDocumentDir(orgId: string): string {
  return path.join(getBaseDir(), orgId);
}

export async function ensureVendorDocumentDir(orgId: string): Promise<string> {
  const dir = getVendorDocumentDir(orgId);
  await mkdir(dir, { recursive: true });
  return dir;
}
