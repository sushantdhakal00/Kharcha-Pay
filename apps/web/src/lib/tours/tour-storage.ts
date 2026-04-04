import type { TourId, PersistedTourState, TourStatus } from "./types";

const PREFIX = "kharchapay:tours";

function key(userId: string, orgId: string, tourId: TourId): string {
  return `${PREFIX}:${userId}:${orgId}:${tourId}`;
}

function hasStorage(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function safeGet(k: string): string | null {
  if (!hasStorage()) return null;
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

function safeSet(k: string, v: string): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(k, v);
  } catch {}
}

function safeRemove(k: string): void {
  if (!hasStorage()) return;
  try {
    localStorage.removeItem(k);
  } catch {}
}

const DEFAULT_STATE: PersistedTourState = {
  status: "never_started",
  currentStep: 0,
  updatedAt: 0,
};

export function getTourState(
  userId: string,
  orgId: string,
  tourId: TourId
): PersistedTourState {
  const raw = safeGet(key(userId, orgId, tourId));
  if (!raw) return { ...DEFAULT_STATE };
  try {
    const parsed = JSON.parse(raw) as PersistedTourState;
    if (parsed && typeof parsed.status === "string") return parsed;
  } catch {}
  return { ...DEFAULT_STATE };
}

export function setTourState(
  userId: string,
  orgId: string,
  tourId: TourId,
  state: PersistedTourState
): void {
  safeSet(key(userId, orgId, tourId), JSON.stringify(state));
}

export function updateTourStatus(
  userId: string,
  orgId: string,
  tourId: TourId,
  status: TourStatus,
  currentStep?: number
): void {
  const existing = getTourState(userId, orgId, tourId);
  setTourState(userId, orgId, tourId, {
    status,
    currentStep: currentStep ?? existing.currentStep,
    updatedAt: Date.now(),
  });
}

export function resetAllTours(userId: string, orgId: string): void {
  if (!hasStorage()) return;
  try {
    const prefix = `${PREFIX}:${userId}:${orgId}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => safeRemove(k));
  } catch {}
}

export function canResume(state: PersistedTourState): boolean {
  return state.status === "in_progress" && state.currentStep > 0;
}

export function shouldAutoStart(state: PersistedTourState): boolean {
  return state.status === "never_started";
}
