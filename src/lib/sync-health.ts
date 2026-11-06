// Tracks whether the automatic Jira sync is working, so admins hear about a long failure instead of finding out from stale data. Pure.
export interface SyncHealth { lastOkAt?: string; failingSince?: string; lastError?: string; lastErrorAt?: string }

export function recordSync(prev: SyncHealth | null | undefined, ok: boolean, error: string | undefined, now: Date): SyncHealth {
  const p = prev ?? {};
  if (ok) return { lastOkAt: now.toISOString() };
  return { lastOkAt: p.lastOkAt, failingSince: p.failingSince ?? now.toISOString(), lastError: (error ?? "Unknown error").slice(0, 200), lastErrorAt: now.toISOString() };
}

/** Minutes the sync has been failing without a success in between (0 when healthy). */
export const failingMinutes = (h: SyncHealth | null | undefined, now: Date) => (h?.failingSince ? Math.max(0, Math.round((now.getTime() - new Date(h.failingSince).getTime()) / 60_000)) : 0);

export const ALERT_AFTER_MIN = 60;
