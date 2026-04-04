import { z } from "zod";

export const auditRetentionSchema = z.object({
  retentionDays: z.number().int().min(30).max(3650),
});

export type AuditRetentionInput = z.infer<typeof auditRetentionSchema>;
