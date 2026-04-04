const lastResetByUser = new Map<string, number>();
const RESET_COOLDOWN_MS = 60_000;

export function canResetDemo(userId: string): boolean {
  const last = lastResetByUser.get(userId);
  if (!last) return true;
  return Date.now() - last >= RESET_COOLDOWN_MS;
}

export function recordDemoReset(userId: string): void {
  lastResetByUser.set(userId, Date.now());
}
