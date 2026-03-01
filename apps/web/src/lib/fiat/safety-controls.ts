import { prisma } from "@/lib/db";
import { logTreasuryAudit } from "./treasury-audit";
import { emitTreasuryEvent } from "./treasury-events";

export class TreasurySafetyError extends Error {
  code = "TREASURY_SAFETY_BLOCKED" as const;
  constructor(
    public readonly controlType: string,
    public readonly reason: string
  ) {
    super(`Treasury operation blocked: ${controlType} — ${reason}`);
  }
}

export interface EffectiveSafetyControls {
  payoutsPaused: boolean;
  onchainPaused: boolean;
  providerPaused: Record<string, boolean>;
  railsPaused: Record<string, boolean>;
  reason: string;
  source: "org" | "global";
}

const DEFAULT_CONTROLS: EffectiveSafetyControls = {
  payoutsPaused: false,
  onchainPaused: false,
  providerPaused: {},
  railsPaused: {},
  reason: "",
  source: "global",
};

export async function getEffectiveSafetyControls(
  orgId?: string | null
): Promise<EffectiveSafetyControls> {
  if (orgId) {
    const orgControls = await prisma.treasurySafetyControls.findUnique({
      where: { orgId },
    });
    if (orgControls) {
      return {
        payoutsPaused: orgControls.payoutsPaused,
        onchainPaused: orgControls.onchainPaused,
        providerPaused: (orgControls.providerPaused as Record<string, boolean>) ?? {},
        railsPaused: (orgControls.railsPaused as Record<string, boolean>) ?? {},
        reason: orgControls.reason,
        source: "org",
      };
    }
  }

  const globalControls = await prisma.treasurySafetyControls.findFirst({
    where: { orgId: null },
  });

  if (globalControls) {
    return {
      payoutsPaused: globalControls.payoutsPaused,
      onchainPaused: globalControls.onchainPaused,
      providerPaused: (globalControls.providerPaused as Record<string, boolean>) ?? {},
      railsPaused: (globalControls.railsPaused as Record<string, boolean>) ?? {},
      reason: globalControls.reason,
      source: "global",
    };
  }

  return { ...DEFAULT_CONTROLS };
}

export async function assertPayoutsAllowed(orgId?: string | null): Promise<void> {
  const controls = await getEffectiveSafetyControls(orgId);
  if (controls.payoutsPaused) {
    await emitBlockedEvent(orgId ?? "global", "payouts_paused", controls.reason);
    await logSafetyBlock(orgId ?? "global", "payouts_paused", controls.reason);
    throw new TreasurySafetyError("payouts_paused", controls.reason || "All payouts are paused");
  }
}

export async function assertOnchainAllowed(orgId?: string | null): Promise<void> {
  const controls = await getEffectiveSafetyControls(orgId);
  if (controls.onchainPaused) {
    await emitBlockedEvent(orgId ?? "global", "onchain_paused", controls.reason);
    await logSafetyBlock(orgId ?? "global", "onchain_paused", controls.reason);
    throw new TreasurySafetyError("onchain_paused", controls.reason || "On-chain operations are paused");
  }
}

export async function assertProviderAllowed(
  provider: string,
  orgId?: string | null
): Promise<void> {
  const controls = await getEffectiveSafetyControls(orgId);
  const key = provider.toUpperCase();
  if (controls.providerPaused[key]) {
    await emitBlockedEvent(orgId ?? "global", `provider_paused:${key}`, controls.reason);
    await logSafetyBlock(orgId ?? "global", `provider_paused:${key}`, controls.reason);
    throw new TreasurySafetyError(
      "provider_paused",
      controls.reason || `Provider ${key} is paused`
    );
  }
}

export async function assertRailAllowed(
  rail: string,
  orgId?: string | null
): Promise<void> {
  const controls = await getEffectiveSafetyControls(orgId);
  const key = rail.toUpperCase();
  if (controls.railsPaused[key]) {
    await emitBlockedEvent(orgId ?? "global", `rail_paused:${key}`, controls.reason);
    await logSafetyBlock(orgId ?? "global", `rail_paused:${key}`, controls.reason);
    throw new TreasurySafetyError(
      "rail_paused",
      controls.reason || `Rail ${key} is paused`
    );
  }
}

export async function assertAllSafetyChecks(params: {
  orgId: string;
  provider: string;
  rail: string;
}): Promise<void> {
  await assertPayoutsAllowed(params.orgId);
  await assertOnchainAllowed(params.orgId);
  await assertProviderAllowed(params.provider, params.orgId);
  await assertRailAllowed(params.rail, params.orgId);
}

export async function updateSafetyControls(params: {
  orgId?: string | null;
  payoutsPaused?: boolean;
  onchainPaused?: boolean;
  providerPaused?: Record<string, boolean>;
  railsPaused?: Record<string, boolean>;
  reason: string;
  actorId?: string;
}): Promise<void> {
  const data: Record<string, unknown> = {
    reason: params.reason,
    updatedAt: new Date(),
  };
  if (params.payoutsPaused !== undefined) data.payoutsPaused = params.payoutsPaused;
  if (params.onchainPaused !== undefined) data.onchainPaused = params.onchainPaused;
  if (params.providerPaused !== undefined) data.providerPaused = params.providerPaused;
  if (params.railsPaused !== undefined) data.railsPaused = params.railsPaused;

  await prisma.treasurySafetyControls.upsert({
    where: { orgId: (params.orgId ?? null) as string | undefined },
    create: {
      orgId: params.orgId ?? null,
      payoutsPaused: params.payoutsPaused ?? false,
      onchainPaused: params.onchainPaused ?? false,
      providerPaused: (params.providerPaused ?? {}) as any,
      railsPaused: (params.railsPaused ?? {}) as any,
      reason: params.reason,
    },
    update: data,
  });

  const orgIdForLog = params.orgId ?? "global";

  await logTreasuryAudit({
    orgId: orgIdForLog,
    actorId: params.actorId,
    action: "SAFETY_CONTROLS_UPDATED" as any,
    entityType: "TreasurySafetyControls",
    entityId: orgIdForLog,
    metadata: {
      payoutsPaused: params.payoutsPaused,
      onchainPaused: params.onchainPaused,
      providerPaused: params.providerPaused,
      railsPaused: params.railsPaused,
      reason: params.reason,
    },
  });

  await emitTreasuryEvent({
    orgId: orgIdForLog,
    type: "SAFETY_CONTROLS_UPDATED" as any,
    entityType: "TreasurySafetyControls",
    entityId: orgIdForLog,
    dedupKey: `safety:${orgIdForLog}:${Date.now()}`,
    payload: {
      payoutsPaused: params.payoutsPaused,
      onchainPaused: params.onchainPaused,
      providerPaused: params.providerPaused,
      railsPaused: params.railsPaused,
      reason: params.reason,
    },
  }).catch(() => {});
}

export async function pauseAll(
  orgId: string | null,
  reason: string,
  actorId?: string
): Promise<void> {
  await updateSafetyControls({
    orgId,
    payoutsPaused: true,
    onchainPaused: true,
    reason,
    actorId,
  });
}

export async function resumeAll(
  orgId: string | null,
  actorId?: string
): Promise<void> {
  await updateSafetyControls({
    orgId,
    payoutsPaused: false,
    onchainPaused: false,
    providerPaused: {},
    railsPaused: {},
    reason: "Operations resumed",
    actorId,
  });
}

async function emitBlockedEvent(
  orgId: string,
  controlType: string,
  reason: string
): Promise<void> {
  await emitTreasuryEvent({
    orgId,
    type: "TREASURY_PAUSED_BLOCK" as any,
    entityType: "TreasurySafetyControls",
    entityId: orgId,
    dedupKey: `safety-block:${orgId}:${controlType}:${Math.floor(Date.now() / 60000)}`,
    payload: { controlType, reason, blockedAt: new Date().toISOString() },
  }).catch(() => {});
}

async function logSafetyBlock(
  orgId: string,
  controlType: string,
  reason: string
): Promise<void> {
  await logTreasuryAudit({
    orgId,
    action: "SAFETY_BLOCKED_EXECUTION" as any,
    entityType: "TreasurySafetyControls",
    entityId: orgId,
    metadata: { controlType, reason },
  });
}
