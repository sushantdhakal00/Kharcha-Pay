import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCircuitBreakerStates } from "@/lib/fiat/circuit-breakers";

export async function GET() {
  const result: Record<string, unknown> = {};

  try {
    const controls = await prisma.treasurySafetyControls.findMany({
      select: {
        orgId: true,
        payoutsPaused: true,
        onchainPaused: true,
        providerPaused: true,
        railsPaused: true,
        reason: true,
        updatedAt: true,
      },
    });
    result.safetyControls = controls;
  } catch {
    result.safetyControls = [];
  }

  try {
    const lastRecon = await prisma.treasuryReconciliationCheck.findFirst({
      orderBy: { createdAt: "desc" },
      select: {
        orgId: true,
        maxSeverity: true,
        createdAt: true,
      },
    });
    result.lastReconciliation = lastRecon
      ? {
          orgId: lastRecon.orgId,
          maxSeverity: lastRecon.maxSeverity,
          checkedAt: lastRecon.createdAt.toISOString(),
        }
      : null;
  } catch {
    result.lastReconciliation = null;
  }

  try {
    const lastSnapshot = await prisma.treasuryBalanceSnapshot.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, orgId: true },
    });
    result.lastSnapshot = lastSnapshot
      ? {
          orgId: lastSnapshot.orgId,
          createdAt: lastSnapshot.createdAt.toISOString(),
        }
      : null;
  } catch {
    result.lastSnapshot = null;
  }

  result.circuitBreakers = getCircuitBreakerStates();

  const anyPaused = Array.isArray(result.safetyControls) &&
    (result.safetyControls as Array<{ payoutsPaused: boolean; onchainPaused: boolean }>).some(
      (c) => c.payoutsPaused || c.onchainPaused
    );

  const cbStates = result.circuitBreakers as ReturnType<typeof getCircuitBreakerStates>;
  const anyTripped =
    cbStates.trippedProviders.length > 0 ||
    cbStates.trippedReconciliation.length > 0;

  let status: "healthy" | "degraded" | "paused" = "healthy";
  if (anyTripped) status = "degraded";
  if (anyPaused) status = "paused";

  return NextResponse.json(
    {
      ok: status === "healthy",
      status,
      time: new Date().toISOString(),
      ...result,
    },
    { status: 200 }
  );
}
