import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";
import { createAuditImmutabilityMiddleware } from "@/lib/fiat/audit-immutability";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  __auditMiddlewareApplied?: boolean;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (!globalForPrisma.__auditMiddlewareApplied) {
  prisma.$use(createAuditImmutabilityMiddleware());
  globalForPrisma.__auditMiddlewareApplied = true;
}

if (env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
