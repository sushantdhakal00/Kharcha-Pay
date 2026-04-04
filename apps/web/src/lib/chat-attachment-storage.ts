/**
 * Chat attachment storage. Org-scoped under .data/chat-attachments/{orgId}/
 */
import path from "path";
import { mkdir } from "fs/promises";

const DATA_DIR_NAME = ".data";
const CHAT_ATTACHMENTS_DIR = "chat-attachments";

function getBaseDir(): string {
  const override = process.env.CHAT_ATTACHMENT_STORAGE_DIR?.trim();
  if (override) return override;
  return path.join(process.cwd(), DATA_DIR_NAME, CHAT_ATTACHMENTS_DIR);
}

export function getChatAttachmentDir(orgId: string): string {
  return path.join(getBaseDir(), orgId);
}

export async function ensureChatAttachmentDir(orgId: string): Promise<string> {
  const dir = getChatAttachmentDir(orgId);
  await mkdir(dir, { recursive: true });
  return dir;
}
