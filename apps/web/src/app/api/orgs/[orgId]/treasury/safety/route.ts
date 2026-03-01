import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import { requireOrgRole } from "@/lib/require-org-role";
import { jsonResponse } from "@/lib/json-response";
import {
  getEffectiveSafetyControls,
  updateSafetyControls,
  pauseAll,
  resumeAll,
} from "@/lib/fiat/safety-controls";
import { getCircuitBreakerStates, resetProviderBreaker, resetReconciliationBreaker } from "@/lib/fiat/circuit-breakers";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, ["ADMIN"]);

    const controls = await getEffectiveSafetyControls(orgId);
    const circuitBreakers = getCircuitBreakerStates();

    const lastRecon = await prisma.treasuryReconciliationCheck.findFirst({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      select: { maxSeverity: true, createdAt: true },
    });

    const lastSnapshot = await prisma.treasuryBalanceSnapshot.findFirst({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    return jsonResponse({
      controls,
      circuitBreakers,
      lastReconciliation: lastRecon
        ? { severity: lastRecon.maxSeverity, checkedAt: lastRecon.createdAt.toISOString() }
        : null,
      lastSnapshotAt: lastSnapshot?.createdAt.toISOString() ?? null,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const user = await requireUser();
    const { orgId } = await params;
    await requireOrgRole(orgId, user.id, ["ADMIN"]);

    const body = await req.json();
    const action = body.action as string;

    switch (action) {
      case "pause_all":
        await pauseAll(orgId, body.reason ?? "Manual pause — all operations", user.id);
        break;

      case "resume_all":
        await resumeAll(orgId, user.id);
        break;

      case "update":
        await updateSafetyControls({
          orgId,
          payoutsPaused: body.payoutsPaused,
          onchainPaused: body.onchainPaused,
          providerPaused: body.providerPaused,
          railsPaused: body.railsPaused,
          reason: body.reason ?? "Admin update",
          actorId: user.id,
        });
        break;

      case "reset_provider_breaker":
        if (body.provider) {
          await resetProviderBreaker(body.provider);
        }
        break;

      case "reset_reconciliation_breaker":
        await resetReconciliationBreaker(orgId);
        break;

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const controls = await getEffectiveSafetyControls(orgId);
    const circuitBreakers = getCircuitBreakerStates();

    return jsonResponse({ ok: true, controls, circuitBreakers });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
}
