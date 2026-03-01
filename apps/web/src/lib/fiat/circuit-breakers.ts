import { updateSafetyControls } from "./safety-controls";
import { emitTreasuryEvent } from "./treasury-events";
import { logTreasuryAudit } from "./treasury-audit";

export interface CircuitBreakerConfig {
  providerFailureRateThreshold: number;
  providerFailureWindowMs: number;
  providerMinSampleSize: number;
  reconciliationCriticalStreak: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  providerFailureRateThreshold: 0.5,
  providerFailureWindowMs: 5 * 60 * 1000,
  providerMinSampleSize: 5,
  reconciliationCriticalStreak: 3,
};

interface ProviderMetrics {
  successes: number[];
  failures: number[];
}

interface CircuitBreakerState {
  providerMetrics: Map<string, ProviderMetrics>;
  reconciliationCriticalStreaks: Map<string, number>;
  trippedProviders: Set<string>;
  trippedReconciliation: Set<string>;
}

const state: CircuitBreakerState = {
  providerMetrics: new Map(),
  reconciliationCriticalStreaks: new Map(),
  trippedProviders: new Set(),
  trippedReconciliation: new Set(),
};

let config = { ...DEFAULT_CONFIG };

export function configureCircuitBreakers(
  overrides: Partial<CircuitBreakerConfig>
): void {
  config = { ...DEFAULT_CONFIG, ...overrides };
}

function getProviderMetrics(provider: string): ProviderMetrics {
  const key = provider.toUpperCase();
  if (!state.providerMetrics.has(key)) {
    state.providerMetrics.set(key, { successes: [], failures: [] });
  }
  return state.providerMetrics.get(key)!;
}

function pruneOldTimestamps(timestamps: number[], windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  return timestamps.filter((ts) => ts > cutoff);
}

export function recordProviderSuccess(provider: string): void {
  const metrics = getProviderMetrics(provider);
  metrics.successes.push(Date.now());
  metrics.successes = pruneOldTimestamps(
    metrics.successes,
    config.providerFailureWindowMs
  );
  metrics.failures = pruneOldTimestamps(
    metrics.failures,
    config.providerFailureWindowMs
  );
}

export async function recordProviderFailure(
  provider: string,
  orgId?: string
): Promise<{ tripped: boolean }> {
  const metrics = getProviderMetrics(provider);
  metrics.failures.push(Date.now());
  metrics.successes = pruneOldTimestamps(
    metrics.successes,
    config.providerFailureWindowMs
  );
  metrics.failures = pruneOldTimestamps(
    metrics.failures,
    config.providerFailureWindowMs
  );

  const total = metrics.successes.length + metrics.failures.length;
  if (total < config.providerMinSampleSize) {
    return { tripped: false };
  }

  const failureRate = metrics.failures.length / total;
  const key = provider.toUpperCase();

  if (failureRate >= config.providerFailureRateThreshold && !state.trippedProviders.has(key)) {
    state.trippedProviders.add(key);
    await tripProviderBreaker(key, failureRate, orgId);
    return { tripped: true };
  }

  return { tripped: false };
}

export async function recordReconciliationSeverity(
  orgId: string,
  severity: string
): Promise<{ tripped: boolean }> {
  const currentStreak = state.reconciliationCriticalStreaks.get(orgId) ?? 0;

  if (severity === "CRITICAL") {
    const newStreak = currentStreak + 1;
    state.reconciliationCriticalStreaks.set(orgId, newStreak);

    if (
      newStreak >= config.reconciliationCriticalStreak &&
      !state.trippedReconciliation.has(orgId)
    ) {
      state.trippedReconciliation.add(orgId);
      await tripReconciliationBreaker(orgId, newStreak);
      return { tripped: true };
    }
  } else {
    state.reconciliationCriticalStreaks.set(orgId, 0);
  }

  return { tripped: false };
}

export function getCircuitBreakerStates(): {
  trippedProviders: string[];
  trippedReconciliation: string[];
  providerMetrics: Record<string, { successes: number; failures: number; failureRate: number }>;
} {
  const metrics: Record<string, { successes: number; failures: number; failureRate: number }> = {};

  for (const [key, m] of state.providerMetrics.entries()) {
    const s = pruneOldTimestamps(m.successes, config.providerFailureWindowMs);
    const f = pruneOldTimestamps(m.failures, config.providerFailureWindowMs);
    const total = s.length + f.length;
    metrics[key] = {
      successes: s.length,
      failures: f.length,
      failureRate: total > 0 ? f.length / total : 0,
    };
  }

  return {
    trippedProviders: Array.from(state.trippedProviders),
    trippedReconciliation: Array.from(state.trippedReconciliation),
    providerMetrics: metrics,
  };
}

export async function resetProviderBreaker(provider: string): Promise<void> {
  const key = provider.toUpperCase();
  state.trippedProviders.delete(key);
  state.providerMetrics.delete(key);

  await updateSafetyControls({
    orgId: null,
    providerPaused: { [key]: false },
    reason: `Circuit breaker reset for provider ${key}`,
  });

  await emitTreasuryEvent({
    orgId: "global",
    type: "CIRCUIT_BREAKER_RESET" as any,
    entityType: "CircuitBreaker",
    entityId: key,
    dedupKey: `cb-reset:${key}:${Date.now()}`,
    payload: { provider: key, action: "reset" },
  }).catch(() => {});
}

export async function resetReconciliationBreaker(orgId: string): Promise<void> {
  state.trippedReconciliation.delete(orgId);
  state.reconciliationCriticalStreaks.set(orgId, 0);

  await updateSafetyControls({
    orgId,
    payoutsPaused: false,
    reason: "Reconciliation circuit breaker reset",
  });

  await emitTreasuryEvent({
    orgId,
    type: "CIRCUIT_BREAKER_RESET" as any,
    entityType: "CircuitBreaker",
    entityId: orgId,
    dedupKey: `cb-reset:recon:${orgId}:${Date.now()}`,
    payload: { orgId, type: "reconciliation", action: "reset" },
  }).catch(() => {});
}

export function resetAllBreakers(): void {
  state.providerMetrics.clear();
  state.reconciliationCriticalStreaks.clear();
  state.trippedProviders.clear();
  state.trippedReconciliation.clear();
}

async function tripProviderBreaker(
  provider: string,
  failureRate: number,
  orgId?: string
): Promise<void> {
  await updateSafetyControls({
    orgId: orgId ?? null,
    providerPaused: { [provider]: true },
    reason: `Circuit breaker tripped: provider ${provider} failure rate ${(failureRate * 100).toFixed(0)}%`,
  });

  const logOrgId = orgId ?? "global";
  await logTreasuryAudit({
    orgId: logOrgId,
    action: "CIRCUIT_BREAKER_TRIPPED" as any,
    entityType: "CircuitBreaker",
    entityId: provider,
    metadata: { provider, failureRate, type: "provider_failure_rate" },
  });

  await emitTreasuryEvent({
    orgId: logOrgId,
    type: "CIRCUIT_BREAKER_TRIPPED" as any,
    entityType: "CircuitBreaker",
    entityId: provider,
    dedupKey: `cb-trip:${provider}:${Math.floor(Date.now() / 60000)}`,
    payload: { provider, failureRate, type: "provider_failure_rate" },
  }).catch(() => {});
}

async function tripReconciliationBreaker(
  orgId: string,
  streak: number
): Promise<void> {
  await updateSafetyControls({
    orgId,
    payoutsPaused: true,
    reason: `Circuit breaker tripped: ${streak} consecutive CRITICAL reconciliation drifts`,
  });

  await logTreasuryAudit({
    orgId,
    action: "CIRCUIT_BREAKER_TRIPPED" as any,
    entityType: "CircuitBreaker",
    entityId: orgId,
    metadata: { streak, type: "reconciliation_critical_streak" },
  });

  await emitTreasuryEvent({
    orgId,
    type: "CIRCUIT_BREAKER_TRIPPED" as any,
    entityType: "CircuitBreaker",
    entityId: orgId,
    dedupKey: `cb-trip:recon:${orgId}:${Math.floor(Date.now() / 60000)}`,
    payload: { orgId, streak, type: "reconciliation_critical_streak" },
  }).catch(() => {});
}
