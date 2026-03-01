/**
 * Process PENDING AccountingSyncJobs. Called by cron.
 * Day 28: job locking, RECONCILE_BILLS, QBO_CDC_SYNC.
 */
import { prisma } from "../db";
import { syncReferenceData } from "./sync-reference";
import { exportBills } from "./export-bills";
import { exportPayments } from "./export-payments";
import { reconcileBills } from "./reconcile-bills";
import { runQboCdcSync } from "./qbo-cdc";
import type { AccountingSyncJobType } from "@prisma/client";

const MAX_JOBS_PER_RUN = 5;

export async function processAccountingSyncJobs(): Promise<{ processed: number; failed: number }> {
  const jobs = await prisma.accountingSyncJob.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: MAX_JOBS_PER_RUN,
  });

  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    const running = await prisma.accountingSyncJob.findFirst({
      where: {
        orgId: job.orgId,
        provider: job.provider,
        type: job.type,
        status: "RUNNING",
        id: { not: job.id },
      },
    });
    if (running) continue;

    await prisma.accountingSyncJob.update({
      where: { id: job.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    const log = async (
      level: "INFO" | "WARN" | "ERROR",
      message: string,
      meta?: object
    ) => {
      await prisma.accountingSyncLog.create({
        data: {
          orgId: job.orgId,
          provider: job.provider,
          jobId: job.id,
          level,
          message,
          meta: meta ?? undefined,
        },
      });
    };

    try {
      switch (job.type as AccountingSyncJobType) {
        case "IMPORT_REFERENCE":
          await syncReferenceData(job.orgId, job.id, log);
          break;
        case "EXPORT_BILLS":
          await exportBills(job.orgId, job.id, log);
          break;
        case "EXPORT_PAYMENTS":
          await exportPayments(job.orgId, job.id, log);
          break;
        case "FULL_SYNC":
          await syncReferenceData(job.orgId, job.id, log);
          await exportBills(job.orgId, job.id, log);
          await exportPayments(job.orgId, job.id, log);
          break;
        case "RECONCILE_BILLS":
          await reconcileBills(job.orgId, job.id, log);
          break;
        case "QBO_CDC_SYNC":
          await runQboCdcSync(job.orgId, job.id, log);
          break;
        default:
          await log("WARN", `Unknown job type: ${job.type}`);
      }

      await prisma.accountingSyncJob.update({
        where: { id: job.id },
        data: { status: "SUCCESS", finishedAt: new Date() },
      });
      await prisma.accountingConnection.updateMany({
        where: { orgId: job.orgId, provider: "QUICKBOOKS_ONLINE" },
        data: { lastSyncAt: new Date() },
      });
      processed++;
    } catch (e) {
      const errMsg = (e as Error).message;
      await log("ERROR", errMsg);
      await prisma.accountingSyncJob.update({
        where: { id: job.id },
        data: { status: "FAILED", finishedAt: new Date(), errorMessage: errMsg },
      });
      failed++;
    }
  }

  return { processed, failed };
}
