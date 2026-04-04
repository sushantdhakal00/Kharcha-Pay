/**
 * Invoice attachment storage. Org-scoped path under .data/invoice-attachments/{orgId}/
 */
import path from "path";
import { mkdir } from "fs/promises";

const DATA_DIR_NAME = ".data";
const INVOICE_ATTACHMENTS_DIR = "invoice-attachments";

function getBaseDir(): string {
  const override = process.env.INVOICE_ATTACHMENT_STORAGE_DIR?.trim();
  if (override) return override;
  return path.join(process.cwd(), DATA_DIR_NAME, INVOICE_ATTACHMENTS_DIR);
}

export function getInvoiceAttachmentDir(orgId: string): string {
  return path.join(getBaseDir(), orgId);
}

export async function ensureInvoiceAttachmentDir(orgId: string): Promise<string> {
  const dir = getInvoiceAttachmentDir(orgId);
  await mkdir(dir, { recursive: true });
  return dir;
}
