import { Prisma } from "@prisma/client";

export class AuditImmutabilityViolation extends Error {
  code = "AUDIT_IMMUTABILITY_VIOLATION" as const;
  constructor(action: string) {
    super(`TreasuryAuditLog is immutable. Cannot ${action} records.`);
  }
}

export function createAuditImmutabilityMiddleware(): Prisma.Middleware {
  return async (params, next) => {
    if (params.model === "TreasuryAuditLog") {
      if (
        params.action === "update" ||
        params.action === "updateMany" ||
        params.action === "delete" ||
        params.action === "deleteMany" ||
        params.action === "upsert"
      ) {
        throw new AuditImmutabilityViolation(params.action);
      }
    }

    if (params.model === "AuditEvent") {
      if (
        params.action === "update" ||
        params.action === "updateMany" ||
        params.action === "delete" ||
        params.action === "deleteMany"
      ) {
        throw new AuditImmutabilityViolation(params.action);
      }
    }

    return next(params);
  };
}
