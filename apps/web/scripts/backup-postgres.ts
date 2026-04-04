#!/usr/bin/env tsx
/**
 * Backup Postgres database. Requires DATABASE_URL.
 * Output: .data/backups/kharchapay_YYYYMMDD_HHMMSS.dump (custom format) or .sql (plain)
 */
import { execSync, spawnSync } from "child_process";
import { mkdir, readdir } from "fs/promises";
import path from "path";

const BACKUP_DIR = ".data/backups";
const RETENTION_COUNT = 10;
const PREFIX = "kharchapay_";

function getTimestamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}_${h}${min}${s}`;
}

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === "") {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  return url;
}

function runPgDump(url: string, outPath: string, format: "custom" | "plain"): boolean {
  const args = format === "custom"
    ? ["-Fc", "-f", outPath, url]
    : ["-f", outPath, url];

  const result = spawnSync("pg_dump", args, {
    stdio: "inherit",
    env: { ...process.env, PGPASSWORD: parsePgPassword(url) },
  });

  return result.status === 0;
}

function parsePgPassword(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.password || undefined;
  } catch {
    return undefined;
  }
}

async function pruneOldBackups(dir: string) {
  const files = await readdir(dir);
  const backups = files
    .filter((f) => f.startsWith(PREFIX) && (f.endsWith(".dump") || f.endsWith(".sql")))
    .sort()
    .reverse();

  if (backups.length <= RETENTION_COUNT) return;

  for (const f of backups.slice(RETENTION_COUNT)) {
    const fp = path.join(dir, f);
    const { unlink } = await import("fs/promises");
    await unlink(fp);
    console.log(`Pruned old backup: ${f}`);
  }
}

async function main() {
  const url = getDatabaseUrl();
  const cwd = process.cwd();
  const backupDir = path.resolve(cwd, BACKUP_DIR);

  await mkdir(backupDir, { recursive: true });

  const timestamp = getTimestamp();
  const customPath = path.join(backupDir, `${PREFIX}${timestamp}.dump`);
  const plainPath = path.join(backupDir, `${PREFIX}${timestamp}.sql`);

  let pgDumpAvailable = false;
  try {
    execSync("pg_dump --version", { stdio: "ignore" });
    pgDumpAvailable = true;
  } catch {
    console.error("pg_dump not found. Install PostgreSQL client tools.");
    process.exit(1);
  }

  const useCustom = runPgDump(url, customPath, "custom");
  if (!useCustom) {
    console.warn("Custom format failed, trying plain SQL...");
    const usePlain = runPgDump(url, plainPath, "plain");
    if (!usePlain) {
      console.error("Backup failed");
      process.exit(1);
    }
    console.log(`Backup written: ${plainPath}`);
  } else {
    console.log(`Backup written: ${customPath}`);
  }

  await pruneOldBackups(backupDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
