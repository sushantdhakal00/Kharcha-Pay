/**
 * Avatar file storage. Uses .data/avatars/ with userId-based filenames.
 */
import path from "path";
import { mkdir, access } from "fs/promises";
import { constants } from "fs";

const DATA_DIR_NAME = ".data";
const AVATARS_DIR_NAME = "avatars";

function getBaseDir(): string {
  const override = process.env.AVATAR_STORAGE_DIR?.trim();
  if (override) return override;
  const cwd = process.cwd();
  return path.join(cwd, DATA_DIR_NAME, AVATARS_DIR_NAME);
}

export async function getAvatarStorageDir(): Promise<string> {
  const baseDir = getBaseDir();
  await mkdir(baseDir, { recursive: true });
  return baseDir;
}

export function getAvatarStorageDirSync(): string {
  return getBaseDir();
}
